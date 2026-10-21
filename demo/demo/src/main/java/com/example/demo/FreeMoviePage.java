package com.example.demo;

import java.util.List;

/**
 * Paginated envelope for the free-movie catalog so the frontend never has to
 * guess whether more pages exist.
 *
 * @param page         1-based page number that was returned
 * @param pageSize     number of entries requested per page
 * @param totalPages   total number of pages in the catalog
 * @param totalResults total number of catalog entries
 * @param hasMore      true when a page after {@code page} still has entries
 * @param results      the entries of this page (possibly empty)
 */
public record FreeMoviePage(
        int page,
        int pageSize,
        int totalPages,
        int totalResults,
        boolean hasMore,
        List<FreeMovie> results
) {}
