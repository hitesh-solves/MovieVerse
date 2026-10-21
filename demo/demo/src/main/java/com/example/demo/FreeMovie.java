package com.example.demo;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A single entry of the MovieVerse "Watch Free &amp; Legally" catalog.
 *
 * <p>{@code id} is the verified TMDB movie id for the title. It is used by the
 * frontend both as a stable card key and to request official watch-provider
 * information, so it must stay in sync with TMDB.</p>
 *
 * <p>{@code playable} is true only when a human-verified, publicly embeddable
 * copy exists and {@code embedUrl} points at that exact item. Catalog entries
 * that are merely discoverable (subscription/rental titles or titles without a
 * verified free copy) set {@code playable} to false and explain why in
 * {@code playbackStatus}.</p>
 */
public record FreeMovie(
        long id,
        String title,
        int year,
        String director,
        String language,
        String duration,
        String genre,
        String overview,
        String posterPath,
        String posterUrl,
        String rating,
        @JsonProperty("isPublicDomain") boolean isPublicDomain,
        String license,
        String licenseUrl,
        String legalStatusReason,
        String sourcePlatform,
        String sourceIdentifier,
        String sourceUrl,
        String embedUrl,
        boolean playable,
        String playbackStatus
) {}
