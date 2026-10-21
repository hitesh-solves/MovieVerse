package com.example.demo;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Map;

@CrossOrigin(origins = {
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "https://unique-sorbet-3ce2b8.netlify.app"
})
@RestController
@RequestMapping("/api/movies")
public class MovieController {

    private final MovieService movieService;

    public MovieController(MovieService movieService) {
        this.movieService = movieService;
    }

    @GetMapping("/test")
    public String test() {
        return "MovieController is working!";
    }

    @GetMapping("/search")
    public String searchMovies(
            @RequestParam String query,
            @RequestParam(defaultValue = "1") int page
    ) throws IOException, InterruptedException {
        return movieService.searchMovies(query, page);
    }

    @GetMapping("/popular")
    public String getPopularMovies(
            @RequestParam(defaultValue = "1") int page
    ) throws IOException, InterruptedException {
        return movieService.getPopularMovies(page);
    }

    @GetMapping("/free")
    public FreeMoviePage getFreeMovies(
            @RequestParam(defaultValue = "1") int page
    ) {
        return movieService.getFreeMovies(page);
    }

    @GetMapping("/free/search")
    public ResponseEntity<?> searchFreeMovies(
            @RequestParam String query
    ) {
        if (query == null || query.isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "Query parameter must not be empty")
            );
        }

        return ResponseEntity.ok(movieService.searchFreeMovies(query.trim()));
    }

    @GetMapping("/{movieId}/watch-providers")
    public ResponseEntity<?> getWatchProviders(
            @PathVariable long movieId,
            @RequestParam(defaultValue = "IN") String region
    ) {
        if (movieId <= 0) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "Movie ID must be a positive number")
            );
        }

        try {
            WatchProvidersResponse response = movieService.getWatchProviders(movieId, region);
            return ResponseEntity.ok(response);
        } catch (MovieNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(
                    Map.of("error", "Movie not found", "movieId", movieId)
            );
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", e.getMessage())
            );
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
                    Map.of("error", "Unable to retrieve watch providers: " + e.getMessage())
            );
        }
    }
}

