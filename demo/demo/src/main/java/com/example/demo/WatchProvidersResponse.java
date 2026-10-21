package com.example.demo;

import java.util.List;

public record WatchProvidersResponse(
        long movieId,
        String region,
        boolean hasProviders,
        String link,
        List<ProviderCategory> categories,
        String attribution,
        String message
) {
    public record ProviderCategory(
            String id,
            String name,
            List<ProviderInfo> providers
    ) {}

    public record ProviderInfo(
            long providerId,
            String providerName,
            String logoPath,
            String logoUrl,
            int displayPriority,
            String officialUrl
    ) {}
}
