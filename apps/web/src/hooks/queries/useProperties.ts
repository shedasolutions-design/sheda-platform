import { useInfiniteQuery } from "@tanstack/react-query";
import { useApi } from "@/contexts/ApiContext";

/**
 * React Query wrapper for property feed with infinite scroll support.
 * Use this in screens that need paginated property lists.
 *
 * Example:
 * ```tsx
 * const { data, fetchNextPage, hasNextPage, isLoading } = usePropertiesQuery();
 * const allProperties = data?.pages.flatMap(p => p) ?? [];
 * ```
 */
export function usePropertiesQuery(limit = 20) {
    const { getProperties } = useApi();

    return useInfiniteQuery({
        queryKey: ["properties", limit],
        queryFn: async ({ pageParam = 1 }) => {
            const result = await getProperties(limit, pageParam);
            return result ?? [];
        },
        getNextPageParam: (lastPage, allPages) => {
            // If the last page returned fewer items than the limit, there are no more
            if (!lastPage || lastPage.length < limit) return undefined;
            return allPages.length + 1;
        },
        initialPageParam: 1,
    });
}
