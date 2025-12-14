export function formatTimestamp(timestamp: string): string {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString();
}