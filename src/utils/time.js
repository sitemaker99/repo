export function formatDistanceToNow(date) {
    if (!date) return '';
    const now  = Date.now();
    const diff = now - new Date(date).getTime();
    const secs  = Math.floor(diff / 1000);
    const mins  = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years  = Math.floor(days / 365);

    if (secs < 60)   return 'just now';
    if (mins < 60)   return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days < 7)    return `${days}d ago`;
    if (weeks < 5)   return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return `${years}y ago`;
}
