package com.example.demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MovieService {

    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private static final String TMDB_BASE_URL = "https://api.themoviedb.org/3";
    private static final String TMDB_POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
    private static final String ARCHIVE_DETAILS_URL = "https://archive.org/details/";
    private static final String ARCHIVE_EMBED_URL = "https://archive.org/embed/";
    private static final long CACHE_TTL_MS = Duration.ofHours(2).toMillis();
    private static final int FREE_MOVIES_PAGE_SIZE = 6;

    /** TMDB watch-provider buckets, in the order they are displayed to the user. */
    private static final String[][] PROVIDER_GROUPS = {
            {"flatrate", "Subscription"},
            {"free", "Free (ad-supported)"},
            {"ads", "Free with ads"},
            {"rent", "Rent"},
            {"buy", "Buy"}
    };

    private static final String VERIFIED_PLAYBACK_STATUS =
            "Verified: playable in-app through the Internet Archive's official player.";
    private static final String COPYRIGHT_PLAYBACK_STATUS =
            "This title is still protected by copyright, so MovieVerse does not offer free in-app playback. "
                    + "Use \"Where to Watch\" for official licensed options.";
    private static final String NO_VERIFIED_COPY_STATUS =
            "No verified, publicly playable copy was found for this title, so in-app playback is unavailable. "
                    + "Use the source link to look it up on the Internet Archive.";
    private static final String REGION_CHECK_STATUS =
            "Not verified as free to stream in any region. Copyright status must be checked locally; "
                    + "use \"Where to Watch\" for official licensed options.";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Environment environment;
    private final Map<String, CacheEntry> watchProvidersCache = new ConcurrentHashMap<>();

    public MovieService(Environment environment) {
        this.environment = environment;
    }

    private static class CacheEntry {
        final WatchProvidersResponse response;
        final long timestamp;

        CacheEntry(WatchProvidersResponse response) {
            this.response = response;
            this.timestamp = System.currentTimeMillis();
        }

        boolean isExpired() {
            return System.currentTimeMillis() - timestamp > CACHE_TTL_MS;
        }
    }

    private String getToken() {
        String token = environment.getProperty("TMDB_TOKEN");
        if (token == null || token.isBlank()) {
            token = System.getenv("TMDB_TOKEN");
        }
        if (token == null || token.isBlank()) {
            throw new IllegalStateException(
                    "TMDB_TOKEN configuration or environment variable is missing"
            );
        }
        return token;
    }

    /**
     * Returns one page of the verified free-movie catalog together with the
     * pagination metadata the frontend needs to stop loading at the right time.
     */
    public FreeMoviePage getFreeMovies(int page) {
        if (page < 1) {
            throw new IllegalArgumentException(
                    "Page number must be at least 1"
            );
        }

        int totalResults = FREE_MOVIES.size();
        int totalPages = (totalResults + FREE_MOVIES_PAGE_SIZE - 1) / FREE_MOVIES_PAGE_SIZE;

        int fromIndex = (page - 1) * FREE_MOVIES_PAGE_SIZE;
        if (fromIndex >= totalResults) {
            return new FreeMoviePage(page, FREE_MOVIES_PAGE_SIZE, totalPages, totalResults, false, List.of());
        }

        int toIndex = Math.min(fromIndex + FREE_MOVIES_PAGE_SIZE, totalResults);
        return new FreeMoviePage(
                page,
                FREE_MOVIES_PAGE_SIZE,
                totalPages,
                totalResults,
                toIndex < totalResults,
                List.copyOf(FREE_MOVIES.subList(fromIndex, toIndex))
        );
    }

    /**
     * Case- and punctuation-insensitive title search restricted to the verified
     * free catalog. An empty result set means "no verified free copy", never
     * "the movie does not exist".
     */
    public List<FreeMovie> searchFreeMovies(String query) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException(
                    "Search query cannot be empty"
            );
        }

        String normalized = normalizeForSearch(query);
        if (normalized.isEmpty()) {
            return List.of();
        }

        return FREE_MOVIES.stream()
                .filter(movie -> normalizeForSearch(movie.title()).contains(normalized))
                .toList();
    }

    static String normalizeForSearch(String value) {
        return value == null
                ? ""
                : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    public String getPopularMovies(int page) throws IOException, InterruptedException {
        if (page < 1) {
            throw new IllegalArgumentException(
                    "Page number must be at least 1"
            );
        }

        String url = TMDB_BASE_URL + "/movie/popular?page=" + page;
        return sendRequest(url);
    }

    public String searchMovies(String query, int page) throws IOException, InterruptedException {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException(
                    "Search query cannot be empty"
            );
        }

        if (page < 1) {
            throw new IllegalArgumentException(
                    "Page number must be at least 1"
            );
        }

        String encodedQuery = URLEncoder.encode(
                query,
                StandardCharsets.UTF_8
        );

        String url = TMDB_BASE_URL
                + "/search/movie?query=" + encodedQuery
                + "&page=" + page;

        return sendRequest(url);
    }

    public WatchProvidersResponse getWatchProviders(long movieId, String region)
            throws IOException, InterruptedException {

        if (movieId <= 0) {
            throw new IllegalArgumentException("Movie ID must be a positive integer");
        }

        String regionCode = (region == null || region.isBlank()) ? "IN" : region.trim().toUpperCase();
        String cacheKey = movieId + ":" + regionCode;

        CacheEntry cached = watchProvidersCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            return cached.response;
        }

        String url = TMDB_BASE_URL + "/movie/" + movieId + "/watch/providers";
        String rawJson = sendRequestForWatchProviders(url, movieId);

        WatchProvidersResponse parsed = parseWatchProvidersResponse(movieId, regionCode, rawJson);
        watchProvidersCache.put(cacheKey, new CacheEntry(parsed));
        return parsed;
    }

    private String sendRequest(String url)
            throws IOException, InterruptedException {

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("accept", "application/json")
                .header("Authorization", "Bearer " + getToken())
                .GET()
                .build();

        IOException lastError = null;

        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                HttpResponse<String> response = CLIENT.send(
                        request,
                        HttpResponse.BodyHandlers.ofString()
                );

                if (response.statusCode() != 200) {
                    throw new IllegalStateException(
                            "TMDB request failed with status: " + response.statusCode()
                    );
                }

                return response.body();
            } catch (IOException e) {
                lastError = e;
                System.err.println(
                        "TMDB connection attempt " + attempt + "/3 failed: " + e.getMessage()
                );

                if (attempt < 3) {
                    Thread.sleep(500L * attempt);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw e;
            }
        }

        throw new IOException(
                "TMDB connection failed after 3 attempts",
                lastError
        );
    }

    private String sendRequestForWatchProviders(String url, long movieId)
            throws IOException, InterruptedException {

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("accept", "application/json")
                .header("Authorization", "Bearer " + getToken())
                .GET()
                .build();

        IOException lastError = null;

        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                HttpResponse<String> response = CLIENT.send(
                        request,
                        HttpResponse.BodyHandlers.ofString()
                );

                if (response.statusCode() == 404) {
                    throw new MovieNotFoundException("Movie not found with ID: " + movieId);
                }

                if (response.statusCode() != 200) {
                    throw new IllegalStateException(
                            "TMDB watch-providers request failed with status: " + response.statusCode()
                    );
                }

                return response.body();
            } catch (IOException e) {
                lastError = e;
                System.err.println(
                        "TMDB watch-providers connection attempt " + attempt + "/3 failed: " + e.getMessage()
                );

                if (attempt < 3) {
                    Thread.sleep(500L * attempt);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw e;
            }
        }

        throw new IOException(
                "TMDB watch-providers connection failed after 3 attempts",
                lastError
        );
    }

    private WatchProvidersResponse parseWatchProvidersResponse(long movieId, String regionCode, String rawJson) {
        String attribution = "Data provided by TMDB (The Movie Database) and JustWatch.";
        try {
            JsonNode root = objectMapper.readTree(rawJson);
            JsonNode results = root.path("results");

            if (results.isMissingNode() || results.isNull()) {
                return new WatchProvidersResponse(
                        movieId,
                        regionCode,
                        false,
                        null,
                        List.of(),
                        attribution,
                        "No streaming provider data available for this title."
                );
            }

            JsonNode regionData = results.path(regionCode);
            if (regionData.isMissingNode() || regionData.isNull()) {
                return new WatchProvidersResponse(
                        movieId,
                        regionCode,
                        false,
                        null,
                        List.of(),
                        attribution,
                        "No official streaming providers are currently listed for this title in " + regionCode + "."
                );
            }

            String link = regionData.path("link").asText(null);
            List<WatchProvidersResponse.ProviderCategory> categories =
                    buildProviderCategories(regionData, link);

            String message = categories.isEmpty()
                    ? "No official streaming providers are currently listed for this title in " + regionCode + "."
                    : "Official options in " + regionCode + " are grouped below. Subscription, rental and "
                            + "purchase categories are paid services - they are not free offers.";

            return new WatchProvidersResponse(
                    movieId,
                    regionCode,
                    !categories.isEmpty(),
                    link,
                    categories,
                    attribution,
                    message
            );
        } catch (MovieNotFoundException e) {
            throw e;
        } catch (Exception e) {
            System.err.println("Error parsing watch providers response: " + e.getMessage());
            return new WatchProvidersResponse(
                    movieId,
                    regionCode,
                    false,
                    null,
                    List.of(),
                    attribution,
                    "Error loading streaming provider data."
            );
        }
    }

    private List<WatchProvidersResponse.ProviderCategory> buildProviderCategories(
            JsonNode regionData,
            String link
    ) {
        List<WatchProvidersResponse.ProviderCategory> categories = new ArrayList<>();

        for (String[] group : PROVIDER_GROUPS) {
            JsonNode providersNode = regionData.path(group[0]);
            if (!providersNode.isArray() || providersNode.isEmpty()) {
                continue;
            }

            List<WatchProvidersResponse.ProviderInfo> providers = new ArrayList<>();
            for (JsonNode provider : providersNode) {
                long providerId = provider.path("provider_id").asLong(-1);
                String providerName = provider.path("provider_name").asText();
                String logoPath = provider.path("logo_path").asText(null);
                int priority = provider.path("display_priority").asInt();

                if (providerName == null || providerName.isBlank()) {
                    continue;
                }

                String logoUrl = (logoPath != null && !logoPath.isBlank())
                        ? TMDB_POSTER_BASE_URL.replace("/w500", "/original")
                                + (logoPath.startsWith("/") ? logoPath : "/" + logoPath)
                        : null;

                providers.add(new WatchProvidersResponse.ProviderInfo(
                        providerId,
                        providerName,
                        logoPath,
                        logoUrl,
                        priority,
                        resolveOfficialUrl(providerName, link)
                ));
            }

            if (!providers.isEmpty()) {
                categories.add(new WatchProvidersResponse.ProviderCategory(
                        group[0],
                        group[1],
                        providers
                ));
            }
        }

        return categories;
    }

    private String resolveOfficialUrl(String providerName, String fallbackLink) {
        if (fallbackLink != null && !fallbackLink.isBlank()) {
            return fallbackLink;
        }

        Map<String, String> providerUrls = new HashMap<>();
        providerUrls.put("Netflix", "https://www.netflix.com");
        providerUrls.put("Amazon Prime Video", "https://www.primevideo.com");
        providerUrls.put("Disney Plus", "https://www.disneyplus.com");
        providerUrls.put("JioHotstar", "https://www.hotstar.com");
        providerUrls.put("Hotstar", "https://www.hotstar.com");
        providerUrls.put("Apple TV", "https://tv.apple.com");
        providerUrls.put("Google Play Movies", "https://play.google.com/store/movies");
        providerUrls.put("YouTube", "https://www.youtube.com");
        providerUrls.put("YouTube Premium", "https://www.youtube.com/premium");
        providerUrls.put("Zee5", "https://www.zee5.com");
        providerUrls.put("SonyLIV", "https://www.sonyliv.com");
        providerUrls.put("Voot", "https://www.voot.com");
        providerUrls.put("MX Player", "https://www.mxplayer.in");
        providerUrls.put("JioCinema", "https://www.jiocinema.com");
        providerUrls.put("Eros Now", "https://erosnow.com");
        providerUrls.put("ALTBalaji", "https://www.altbalaji.com");
        providerUrls.put("Hungama Play", "https://www.hungama.com");

        return providerUrls.get(providerName);
    }

    /**
     * The verified catalog. Every playable entry was checked against the live
     * Internet Archive metadata API: the item exists, it is not dark or
     * access-restricted and it exposes public H.264 video files. Entries whose
     * copy could not be verified keep {@code playable == false} so the UI can
     * say so honestly instead of pretending a broken video works.
     */
    private static final List<FreeMovie> FREE_MOVIES = List.of(
            new FreeMovie(
                    961L,
                    "The General",
                    1926,
                    "Buster Keaton, Clyde Bruckman",
                    "Silent (English intertitles)",
                    "1h 19m",
                    "Action, Comedy, Drama",
                    "A Confederate engineer during the American Civil War is rejected by the army and travels west to become a railroad surveyor.",
                    "/4NmV1Wei4LxT2lpjViCAScgCZLq.jpg",
                    TMDB_POSTER_BASE_URL + "/4NmV1Wei4LxT2lpjViCAScgCZLq.jpg",
                    "8.0",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in the United States in 1926. Works published before 1930 are in the public domain in the United States.",
                    "Internet Archive",
                    "The_General_Buster_Keaton",
                    ARCHIVE_DETAILS_URL + "The_General_Buster_Keaton",
                    ARCHIVE_EMBED_URL + "The_General_Buster_Keaton",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    775L,
                    "A Trip to the Moon",
                    1902,
                    "Georges Melies",
                    "Silent (French intertitles)",
                    "13m",
                    "Adventure, Fantasy, Short",
                    "A group of astronomers travel to the Moon in a cannon-propelled capsule.",
                    "/9o0v5LLFk51nyTBHZSre6OB37n2.jpg",
                    TMDB_POSTER_BASE_URL + "/9o0v5LLFk51nyTBHZSre6OB37n2.jpg",
                    "7.8",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Released in France in 1902. Public domain in the United States as a pre-1930 publication.",
                    "Internet Archive",
                    "ATripToTheMoonGeorgeMelies",
                    ARCHIVE_DETAILS_URL + "ATripToTheMoonGeorgeMelies",
                    ARCHIVE_EMBED_URL + "ATripToTheMoonGeorgeMelies",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    992L,
                    "Sherlock Jr.",
                    1924,
                    "Buster Keaton",
                    "Silent (English intertitles)",
                    "45m",
                    "Comedy, Romance",
                    "A film projectionist dreams of being a detective and inserts himself into the movie he is projecting.",
                    "/1G9r3rqtbFAQuyWKOZm4Y5J5s7Q.jpg",
                    TMDB_POSTER_BASE_URL + "/1G9r3rqtbFAQuyWKOZm4Y5J5s7Q.jpg",
                    "7.8",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1924. Entered the United States public domain on January 1, 2020 after its 95-year copyright term expired.",
                    "Internet Archive",
                    "MyMovie_20190318",
                    ARCHIVE_DETAILS_URL + "MyMovie_20190318",
                    ARCHIVE_EMBED_URL + "MyMovie_20190318",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    10331L,
                    "Night of the Living Dead",
                    1968,
                    "George A. Romero",
                    "English",
                    "1h 36m",
                    "Horror",
                    "A group of people barricade themselves in a farmhouse while the dead rise from their graves.",
                    "/rb2NWyb008u1EcKCOyXs2Nmj0ra.jpg",
                    TMDB_POSTER_BASE_URL + "/rb2NWyb008u1EcKCOyXs2Nmj0ra.jpg",
                    "7.4",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not properly secured on the original release, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "Night.Of.The.Living.Dead_1080p",
                    ARCHIVE_DETAILS_URL + "Night.Of.The.Living.Dead_1080p",
                    ARCHIVE_EMBED_URL + "Night.Of.The.Living.Dead_1080p",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    234L,
                    "The Cabinet of Dr. Caligari",
                    1920,
                    "Robert Wiene",
                    "Silent (German intertitles)",
                    "1h 13m",
                    "Horror, Mystery",
                    "A man relates a story about his friend who was controlled by a mysterious sleepwalker.",
                    "/myK9DeIsXWGKgUTZyGXg2IfFk0W.jpg",
                    TMDB_POSTER_BASE_URL + "/myK9DeIsXWGKgUTZyGXg2IfFk0W.jpg",
                    "8.0",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1920. Public domain in the United States as a pre-1930 publication.",
                    "Internet Archive",
                    "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari",
                    ARCHIVE_DETAILS_URL + "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari",
                    ARCHIVE_EMBED_URL + "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    653L,
                    "Nosferatu",
                    1922,
                    "F.W. Murnau",
                    "Silent (German intertitles)",
                    "1h 34m",
                    "Horror",
                    "A vampire travels from Transylvania to Germany, bringing death and terror in his wake.",
                    "/zv7J85D8CC9qYagAEhPM63CIG6j.jpg",
                    TMDB_POSTER_BASE_URL + "/zv7J85D8CC9qYagAEhPM63CIG6j.jpg",
                    "7.9",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1922. Public domain in the United States as a pre-1930 publication.",
                    "Internet Archive",
                    "Nosferatu_DVD_quality",
                    ARCHIVE_DETAILS_URL + "Nosferatu_DVD_quality",
                    ARCHIVE_EMBED_URL + "Nosferatu_DVD_quality",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    19L,
                    "Metropolis",
                    1927,
                    "Fritz Lang",
                    "Silent (German intertitles)",
                    "2h 33m",
                    "Drama, Sci-Fi",
                    "In a futuristic city sharply divided between the working class and the city planners, the son of the city's mastermind falls in love with a working-class prophet.",
                    "/kr9wXRN23zLuWJIelahas1mtnYj.jpg",
                    TMDB_POSTER_BASE_URL + "/kr9wXRN23zLuWJIelahas1mtnYj.jpg",
                    "8.2",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not renewed for the 1927 original release, placing the original version in the public domain in the United States. Later restorations may carry their own rights.",
                    "Internet Archive",
                    "Metropolis1927EnglishVersion",
                    ARCHIVE_DETAILS_URL + "Metropolis1927EnglishVersion",
                    ARCHIVE_EMBED_URL + "Metropolis1927EnglishVersion",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    643L,
                    "Battleship Potemkin",
                    1925,
                    "Sergei Eisenstein",
                    "Silent (Russian intertitles)",
                    "1h 15m",
                    "Drama, History",
                    "A dramatized account of a Russian battleship crew's rebellion against their officers in 1905.",
                    "/hZmsRLsCnE9Zshf1YJONUpCOhds.jpg",
                    TMDB_POSTER_BASE_URL + "/hZmsRLsCnE9Zshf1YJONUpCOhds.jpg",
                    "8.0",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1925. Public domain in the United States as a pre-1930 publication.",
                    "Internet Archive",
                    "BattleshipPotemkin",
                    ARCHIVE_DETAILS_URL + "BattleshipPotemkin",
                    ARCHIVE_EMBED_URL + "BattleshipPotemkin",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    22596L,
                    "Safety Last!",
                    1923,
                    "Fred C. Newmeyer, Sam Taylor",
                    "Silent (English intertitles)",
                    "1h 10m",
                    "Comedy, Romance",
                    "A young man climbs a tall building to win money and impress his girlfriend.",
                    "/fEt5HWJ32ek8ibef7zSZnA00Jp0.jpg",
                    TMDB_POSTER_BASE_URL + "/fEt5HWJ32ek8ibef7zSZnA00Jp0.jpg",
                    "7.8",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1923. Entered the United States public domain on January 1, 2019 after its 95-year copyright term expired.",
                    "Internet Archive",
                    "silent-safety-last",
                    ARCHIVE_DETAILS_URL + "silent-safety-last",
                    ARCHIVE_EMBED_URL + "silent-safety-last",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    25768L,
                    "Steamboat Bill, Jr.",
                    1928,
                    "Charles Reisner",
                    "Silent (English intertitles)",
                    "1h 11m",
                    "Comedy",
                    "A young man tries to win his father's approval while navigating a series of misadventures.",
                    "/zygJMsmXxeyDc1N67OCZc8xtq4I.jpg",
                    TMDB_POSTER_BASE_URL + "/zygJMsmXxeyDc1N67OCZc8xtq4I.jpg",
                    "7.6",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1928. Entered the United States public domain on January 1, 2024 after its 95-year copyright term expired.",
                    "Internet Archive",
                    "SteamboatBillJr",
                    ARCHIVE_DETAILS_URL + "SteamboatBillJr",
                    ARCHIVE_EMBED_URL + "SteamboatBillJr",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    962L,
                    "The Gold Rush",
                    1925,
                    "Charlie Chaplin",
                    "Silent (English intertitles)",
                    "1h 35m",
                    "Comedy, Drama",
                    "The Tramp travels to the Klondike in search of gold and faces numerous hardships.",
                    "/eQRFo1qwRREYwj47Yoe1PisgOle.jpg",
                    TMDB_POSTER_BASE_URL + "/eQRFo1qwRREYwj47Yoe1PisgOle.jpg",
                    "8.0",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "The 1925 original version is public domain in the United States. Chaplin's 1942 re-edit is not. The verified copy is the 1925 silent version.",
                    "Internet Archive",
                    "the-gold-rush-film-1925",
                    ARCHIVE_DETAILS_URL + "the-gold-rush-film-1925",
                    ARCHIVE_EMBED_URL + "the-gold-rush-film-1925",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    3063L,
                    "Duck Soup",
                    1933,
                    "Leo McCarey",
                    "English",
                    "1h 8m",
                    "Comedy",
                    "Rufus T. Firefly is named the dictator of bankrupt Freedonia and declares war on neighboring Sylvania over the love of his wealthy neighbor Mrs. Teasdale.",
                    "/31t63plEGKHhYuuCpC9bFWO9SBS.jpg",
                    TMDB_POSTER_BASE_URL + "/31t63plEGKHhYuuCpC9bFWO9SBS.jpg",
                    "7.7",
                    true,
                    "Public Domain (US)",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Commonly listed as public domain in the United States because the copyright was not renewed. Some rights holders dispute this, so verify the status for your own region.",
                    "Internet Archive",
                    "duck-soup-1933_202301",
                    ARCHIVE_DETAILS_URL + "duck-soup-1933_202301",
                    ARCHIVE_EMBED_URL + "duck-soup-1933_202301",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    20367L,
                    "Detour",
                    1945,
                    "Edgar G. Ulmer",
                    "English",
                    "1h 9m",
                    "Film Noir, Thriller",
                    "A hitchhiker gets a ride from a driver who dies, leaving him with the car and a dangerous situation.",
                    "/gJb9HRAs1V4bA0VKsWpT6mhv2RT.jpg",
                    TMDB_POSTER_BASE_URL + "/gJb9HRAs1V4bA0VKsWpT6mhv2RT.jpg",
                    "7.4",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "Detour",
                    ARCHIVE_DETAILS_URL + "Detour",
                    ARCHIVE_EMBED_URL + "Detour",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    15856L,
                    "The House on Haunted Hill",
                    1959,
                    "William Castle",
                    "English",
                    "1h 15m",
                    "Horror",
                    "A millionaire offers five strangers $10,000 each to spend the night in a haunted house.",
                    "/g5kdFt3piV3w1pG65W9sSToJ7HB.jpg",
                    TMDB_POSTER_BASE_URL + "/g5kdFt3piV3w1pG65W9sSToJ7HB.jpg",
                    "6.9",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "House_On_Haunted_Hill.avi",
                    ARCHIVE_DETAILS_URL + "House_On_Haunted_Hill.avi",
                    ARCHIVE_EMBED_URL + "House_On_Haunted_Hill.avi",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    21159L,
                    "The Last Man on Earth",
                    1964,
                    "Ubaldo Ragona, Sidney Salkow",
                    "English",
                    "1h 26m",
                    "Horror, Sci-Fi",
                    "A scientist is the last human survivor of a plague that turned everyone into vampires.",
                    "/tnBdjQsYS0bvfrrL6PdexThqtUE.jpg",
                    TMDB_POSTER_BASE_URL + "/tnBdjQsYS0bvfrrL6PdexThqtUE.jpg",
                    "6.5",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "TheLastManOnEarth1964_201808",
                    ARCHIVE_DETAILS_URL + "TheLastManOnEarth1964_201808",
                    ARCHIVE_EMBED_URL + "TheLastManOnEarth1964_201808",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    4808L,
                    "Charade",
                    1963,
                    "Stanley Donen",
                    "English",
                    "1h 53m",
                    "Comedy, Mystery, Romance",
                    "A romantic suspense comedy about a woman pursued by several men who want a fortune her murdered husband had stolen.",
                    "/qqaPjC5FQidtKY65jbAKZPiOTaS.jpg",
                    TMDB_POSTER_BASE_URL + "/qqaPjC5FQidtKY65jbAKZPiOTaS.jpg",
                    "7.8",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "The copyright was not properly renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie",
                    ARCHIVE_DETAILS_URL + "charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie",
                    ARCHIVE_EMBED_URL + "charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    3085L,
                    "His Girl Friday",
                    1940,
                    "Howard Hawks",
                    "English",
                    "1h 32m",
                    "Comedy, Romance, Drama",
                    "Flamboyant newspaper publisher Walter Burns tries every outrageous trick in the book to prevent his top reporter and ex-wife from marrying an insurance man and leaving the paper.",
                    "/lu86Y9zTPH3neCiUzLzHCEFHf7f.jpg",
                    TMDB_POSTER_BASE_URL + "/lu86Y9zTPH3neCiUzLzHCEFHf7f.jpg",
                    "7.7",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Released in 1940 by Columbia Pictures. The copyright was never renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "his_girl_friday",
                    ARCHIVE_DETAILS_URL + "his_girl_friday",
                    ARCHIVE_EMBED_URL + "his_girl_friday",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    626L,
                    "Un Chien Andalou",
                    1929,
                    "Luis Bunuel, Salvador Dali",
                    "Silent (French intertitles)",
                    "21m",
                    "Surrealist, Short",
                    "A groundbreaking surrealist short film with shocking imagery.",
                    "/obvE7ElAvCUhKtWFwDSvNbPw9PV.jpg",
                    TMDB_POSTER_BASE_URL + "/obvE7ElAvCUhKtWFwDSvNbPw9PV.jpg",
                    "7.8",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1929. Public domain in the United States as a pre-1930 publication.",
                    "Internet Archive",
                    "UnChienAndalou1929_201807",
                    ARCHIVE_DETAILS_URL + "UnChienAndalou1929_201807",
                    ARCHIVE_EMBED_URL + "UnChienAndalou1929_201807",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    3059L,
                    "Intolerance",
                    1916,
                    "D.W. Griffith",
                    "English",
                    "2h 37m",
                    "Drama",
                    "Four interwoven stories from different eras explore themes of love and intolerance across human history.",
                    "/lJCabs4TMOsKfnl0BmA5Hf16Ezb.jpg",
                    TMDB_POSTER_BASE_URL + "/lJCabs4TMOsKfnl0BmA5Hf16Ezb.jpg",
                    "7.8",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1916. Public domain in the United States as a pre-1930 publication.",
                    "Internet Archive",
                    "Intolerance",
                    ARCHIVE_DETAILS_URL + "Intolerance",
                    ARCHIVE_EMBED_URL + "Intolerance",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    77621L,
                    "Within Our Gates",
                    1920,
                    "Oscar Micheaux",
                    "English",
                    "1h 29m",
                    "Drama",
                    "An African American woman ventures North to raise money for a school in the South.",
                    "/36MR5nOWUZypLY3i32LCjdqxXOQ.jpg",
                    TMDB_POSTER_BASE_URL + "/36MR5nOWUZypLY3i32LCjdqxXOQ.jpg",
                    "6.5",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1920. Public domain in the United States as a pre-1930 publication.",
                    "Internet Archive",
                    "withinOurGates1920",
                    ARCHIVE_DETAILS_URL + "withinOurGates1920",
                    ARCHIVE_EMBED_URL + "withinOurGates1920",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    2981L,
                    "The Lost World",
                    1925,
                    "Harry O. Hoyt",
                    "English",
                    "1h 40m",
                    "Adventure, Sci-Fi",
                    "Professor Challenger leads an expedition to a plateau where dinosaurs still exist.",
                    "/411VnWtYJdEFKiaGqJOeTmBv8th.jpg",
                    TMDB_POSTER_BASE_URL + "/411VnWtYJdEFKiaGqJOeTmBv8th.jpg",
                    "6.7",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1925. Public domain in the United States as a pre-1930 publication.",
                    "Internet Archive",
                    "lost_world",
                    ARCHIVE_DETAILS_URL + "lost_world",
                    ARCHIVE_EMBED_URL + "lost_world",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    18987L,
                    "The Hunchback of Notre Dame",
                    1923,
                    "Wallace Worsley",
                    "English",
                    "1h 52m",
                    "Drama, Romance",
                    "Quasimodo, the hunchback bell-ringer of Notre Dame, falls in love with a gypsy dancer.",
                    "/3oheTQrTuqS1jPUW6GOc65ZbM5u.jpg",
                    TMDB_POSTER_BASE_URL + "/3oheTQrTuqS1jPUW6GOc65ZbM5u.jpg",
                    "7.3",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1923. Entered the United States public domain on January 1, 2019 after its 95-year copyright term expired.",
                    "Internet Archive",
                    "The_Hunchback_of_Notre_Dame",
                    ARCHIVE_DETAILS_URL + "The_Hunchback_of_Notre_Dame",
                    ARCHIVE_EMBED_URL + "The_Hunchback_of_Notre_Dame",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    22614L,
                    "The Scarlet Pimpernel",
                    1934,
                    "Harold Young",
                    "English",
                    "1h 37m",
                    "Adventure, Drama",
                    "A British nobleman rescues French aristocrats from the guillotine during the French Revolution.",
                    "/9sPfawJsdTnlmdNmPHrsOA9bx2I.jpg",
                    TMDB_POSTER_BASE_URL + "/9sPfawJsdTnlmdNmPHrsOA9bx2I.jpg",
                    "7.2",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "TheScarletPimpernel",
                    ARCHIVE_DETAILS_URL + "TheScarletPimpernel",
                    ARCHIVE_EMBED_URL + "TheScarletPimpernel",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    25694L,
                    "Alice in Wonderland",
                    1933,
                    "Norman Z. McLeod",
                    "English",
                    "1h 16m",
                    "Fantasy, Adventure, Comedy",
                    "Alice follows a White Rabbit into a fantastical world filled with peculiar characters.",
                    "/k4hlsqfhEtTrEtiDE647qxTR6PI.jpg",
                    TMDB_POSTER_BASE_URL + "/k4hlsqfhEtTrEtiDE647qxTR6PI.jpg",
                    "6.5",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "AliceInWonderland1933NormanMcleodCaryGrantCharlotteHenryLeonErrolEnglish",
                    ARCHIVE_DETAILS_URL + "AliceInWonderland1933NormanMcleodCaryGrantCharlotteHenryLeonErrolEnglish",
                    ARCHIVE_EMBED_URL + "AliceInWonderland1933NormanMcleodCaryGrantCharlotteHenryLeonErrolEnglish",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    42518L,
                    "Gulliver's Travels",
                    1939,
                    "Dave Fleischer",
                    "English",
                    "1h 16m",
                    "Animation, Adventure, Fantasy",
                    "Gulliver washes ashore in Lilliput and is captured by tiny inhabitants.",
                    "/fiwAJIAnSqWbU3JphqN8Y80mFM6.jpg",
                    TMDB_POSTER_BASE_URL + "/fiwAJIAnSqWbU3JphqN8Y80mFM6.jpg",
                    "6.4",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "gullivers_travels1939",
                    ARCHIVE_DETAILS_URL + "gullivers_travels1939",
                    ARCHIVE_EMBED_URL + "gullivers_travels1939",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    43386L,
                    "Cyrano de Bergerac",
                    1950,
                    "Michael Gordon",
                    "English",
                    "1h 52m",
                    "Drama, Romance",
                    "A swordsman with a large nose helps a handsome man woo the woman they both love.",
                    "/l4JFOXslwb90opz8xozfIhPke8z.jpg",
                    TMDB_POSTER_BASE_URL + "/l4JFOXslwb90opz8xozfIhPke8z.jpg",
                    "7.2",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Copyright was not renewed, placing the film in the public domain in the United States.",
                    "Internet Archive",
                    "CyranoDeBergerac1950",
                    ARCHIVE_DETAILS_URL + "CyranoDeBergerac1950",
                    ARCHIVE_EMBED_URL + "CyranoDeBergerac1950",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    1235376L,
                    "Ek Anek Aur Ekta",
                    1974,
                    "Bhimsain",
                    "Hindi",
                    "7m",
                    "Animation, Educational, Short",
                    "A classic animated short from India's Films Division promoting unity and diversity among children.",
                    "/x5miQJAFtZnzyRjYJ5a5gs6jIvk.jpg",
                    TMDB_POSTER_BASE_URL + "/x5miQJAFtZnzyRjYJ5a5gs6jIvk.jpg",
                    "N/A",
                    true,
                    "Government of India - Educational",
                    "https://filmsdivision.org/",
                    "Produced by the Films Division of India as educational and cultural content for public viewing.",
                    "Internet Archive",
                    "ek-anek",
                    ARCHIVE_DETAILS_URL + "ek-anek",
                    ARCHIVE_EMBED_URL + "ek-anek",
                    true,
                    VERIFIED_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    10098L,
                    "The Kid",
                    1921,
                    "Charlie Chaplin",
                    "Silent (English intertitles)",
                    "1h 8m",
                    "Comedy, Drama",
                    "The Tramp cares for an abandoned child, forming a deep bond as they face life's challenges together.",
                    "/drgMcyTsySQBnUPGaBThCHGdlWT.jpg",
                    TMDB_POSTER_BASE_URL + "/drgMcyTsySQBnUPGaBThCHGdlWT.jpg",
                    "8.0",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "The 1921 original entered the United States public domain on January 1, 2017. Chaplin's later re-edits may still carry rights.",
                    "Internet Archive",
                    null,
                    "https://archive.org/search?query=The+Kid+1921+Chaplin",
                    null,
                    false,
                    NO_VERIFIED_COPY_STATUS
            ),
            new FreeMovie(
                    28978L,
                    "The Circus",
                    1928,
                    "Charlie Chaplin",
                    "Silent (English intertitles)",
                    "1h 12m",
                    "Comedy, Drama",
                    "The Tramp joins a circus and falls for the ringmaster's daughter while trying to evade the police.",
                    "/sihWAgBYa8yZFVAonGFGbLTVUj2.jpg",
                    TMDB_POSTER_BASE_URL + "/sihWAgBYa8yZFVAonGFGbLTVUj2.jpg",
                    "8.0",
                    true,
                    "Public Domain",
                    "http://creativecommons.org/licenses/publicdomain/",
                    "Published in 1928. Entered the United States public domain on January 1, 2024 after its 95-year copyright term expired.",
                    "Internet Archive",
                    null,
                    "https://archive.org/search?query=The+Circus+1928+Chaplin",
                    null,
                    false,
                    NO_VERIFIED_COPY_STATUS
            ),
            new FreeMovie(
                    3082L,
                    "Modern Times",
                    1936,
                    "Charlie Chaplin",
                    "English",
                    "1h 27m",
                    "Comedy, Drama",
                    "The Tramp struggles to survive in modern industrial society during the Great Depression.",
                    "/AthaPakkuCLROdKxtRbKWclkDBK.jpg",
                    TMDB_POSTER_BASE_URL + "/AthaPakkuCLROdKxtRbKWclkDBK.jpg",
                    "8.4",
                    false,
                    "In copyright",
                    "https://www.themoviedb.org/movie/3082",
                    "Charlie Chaplin's estate renewed the copyright, so this film is not public domain. MovieVerse therefore does not offer free playback for it.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/3082/watch",
                    null,
                    false,
                    COPYRIGHT_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    914L,
                    "The Great Dictator",
                    1940,
                    "Charlie Chaplin",
                    "English",
                    "2h 5m",
                    "Comedy, Drama",
                    "A Jewish barber escapes persecution and is mistaken for a dictator resembling him.",
                    "/nhMXB8GTdswYMCL9nepDZymJCOr.jpg",
                    TMDB_POSTER_BASE_URL + "/nhMXB8GTdswYMCL9nepDZymJCOr.jpg",
                    "8.2",
                    false,
                    "In copyright",
                    "https://www.themoviedb.org/movie/914",
                    "Still protected by copyright (renewed by the Chaplin estate). MovieVerse therefore does not offer free playback for it.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/914/watch",
                    null,
                    false,
                    COPYRIGHT_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    900L,
                    "Bringing Up Baby",
                    1938,
                    "Howard Hawks",
                    "English",
                    "1h 42m",
                    "Comedy",
                    "A paleontologist and a wealthy heiress clash over a dinosaur bone.",
                    "/vTNNOtemaYmtx3k2NpsLMRJKEwZ.jpg",
                    TMDB_POSTER_BASE_URL + "/vTNNOtemaYmtx3k2NpsLMRJKEwZ.jpg",
                    "7.8",
                    false,
                    "In copyright",
                    "https://www.themoviedb.org/movie/900",
                    "Still protected by copyright. The Internet Archive copy is only a trailer, so full-film playback is not offered.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/900/watch",
                    null,
                    false,
                    COPYRIGHT_PLAYBACK_STATUS
            ),
            new FreeMovie(
                    210923L,
                    "Bhuvan Shome",
                    1969,
                    "Mrinal Sen",
                    "Hindi",
                    "1h 35m",
                    "Drama",
                    "A bureaucrat's life changes after a trip to rural India.",
                    "/5AVlOL89rwGu7NxghSFoefNto0X.jpg",
                    TMDB_POSTER_BASE_URL + "/5AVlOL89rwGu7NxghSFoefNto0X.jpg",
                    "N/A",
                    false,
                    "Copyright status unverified",
                    "https://www.themoviedb.org/movie/210923",
                    "Not verified as free to stream. Copyright status must be confirmed for your region before viewing.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/210923/watch",
                    null,
                    false,
                    REGION_CHECK_STATUS
            ),
            new FreeMovie(
                    326800L,
                    "Samskara",
                    1970,
                    "Pattabhirama Reddy",
                    "Kannada",
                    "2h 6m",
                    "Drama",
                    "A Brahmin faces a dilemma when a fellow Brahmin dies in his village.",
                    "/jJRm0mqPGevt74aoF70upyGZshn.jpg",
                    TMDB_POSTER_BASE_URL + "/jJRm0mqPGevt74aoF70upyGZshn.jpg",
                    "N/A",
                    false,
                    "Copyright status unverified",
                    "https://www.themoviedb.org/movie/326800",
                    "Not verified as free to stream. Copyright status must be confirmed for your region before viewing.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/326800/watch",
                    null,
                    false,
                    REGION_CHECK_STATUS
            ),
            new FreeMovie(
                    43027L,
                    "Teen Kanya",
                    1961,
                    "Satyajit Ray",
                    "Bengali",
                    "2h 9m",
                    "Drama",
                    "Three stories about women facing different challenges.",
                    "/oLGz80EeHTI5WC0lq9wfYT2FfgU.jpg",
                    TMDB_POSTER_BASE_URL + "/oLGz80EeHTI5WC0lq9wfYT2FfgU.jpg",
                    "N/A",
                    false,
                    "Copyright status unverified",
                    "https://www.themoviedb.org/movie/43027",
                    "Not verified as free to stream. Copyright status must be confirmed for your region before viewing.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/43027/watch",
                    null,
                    false,
                    REGION_CHECK_STATUS
            ),
            new FreeMovie(
                    265070L,
                    "Chemmeen",
                    1965,
                    "Ramu Kariat",
                    "Malayalam",
                    "2h 16m",
                    "Drama, Romance",
                    "A fisherman's love story with tragic consequences.",
                    "/jOAjmEQD4LUYFVgR41fAEutaVQb.jpg",
                    TMDB_POSTER_BASE_URL + "/jOAjmEQD4LUYFVgR41fAEutaVQb.jpg",
                    "N/A",
                    false,
                    "Copyright status unverified",
                    "https://www.themoviedb.org/movie/265070",
                    "Not verified as free to stream. Copyright status must be confirmed for your region before viewing.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/265070/watch",
                    null,
                    false,
                    REGION_CHECK_STATUS
            ),
            new FreeMovie(
                    158023L,
                    "Mayabazar",
                    1957,
                    "Kadiri Venkata Reddy",
                    "Telugu",
                    "2h 48m",
                    "Fantasy, Drama",
                    "A mythological tale from the Mahabharata.",
                    "/pJfpDHlmVgMgg0VNCufj9gIhnbU.jpg",
                    TMDB_POSTER_BASE_URL + "/pJfpDHlmVgMgg0VNCufj9gIhnbU.jpg",
                    "N/A",
                    false,
                    "Copyright status unverified",
                    "https://www.themoviedb.org/movie/158023",
                    "Not verified as free to stream. Copyright status must be confirmed for your region before viewing.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/158023/watch",
                    null,
                    false,
                    REGION_CHECK_STATUS
            ),
            new FreeMovie(
                    197361L,
                    "Parasakthi",
                    1952,
                    "Krishnan-Panju",
                    "Tamil",
                    "2h 42m",
                    "Drama",
                    "Post-independence Tamil cinema classic.",
                    "/hqc8Xnz9rHZxIn6WU2xxPKJKuX.jpg",
                    TMDB_POSTER_BASE_URL + "/hqc8Xnz9rHZxIn6WU2xxPKJKuX.jpg",
                    "N/A",
                    false,
                    "Copyright status unverified",
                    "https://www.themoviedb.org/movie/197361",
                    "Not verified as free to stream. Copyright status must be confirmed for your region before viewing.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/197361/watch",
                    null,
                    false,
                    REGION_CHECK_STATUS
            ),
            new FreeMovie(
                    129555L,
                    "Raja Harishchandra",
                    1913,
                    "Dadasaheb Phalke",
                    "Hindi",
                    "1h 43m",
                    "Drama",
                    "A king sacrifices everything to keep his promise to a sage, leading to his family's suffering. This is India's first full-length feature film.",
                    "/cDJdmESCIptAIZ3woR5qxgRlquR.jpg",
                    TMDB_POSTER_BASE_URL + "/cDJdmESCIptAIZ3woR5qxgRlquR.jpg",
                    "N/A",
                    false,
                    "Copyright status unverified",
                    "https://www.themoviedb.org/movie/129555",
                    "Only fragments of this 1913 film survive and no verified free copy is available, so in-app playback is not offered.",
                    "TMDB (watch providers)",
                    null,
                    "https://www.themoviedb.org/movie/129555/watch",
                    null,
                    false,
                    REGION_CHECK_STATUS
            )
    );
}
