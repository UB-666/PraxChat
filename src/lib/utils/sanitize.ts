/**
 * sanitize.ts
 * 
 * Security utilities for preventing XSS and other injection attacks.
 * All user-generated content should pass through these functions before display.
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this for any user-generated text content before rendering.
 * 
 * @param text - Raw text that may contain HTML/script
 * @returns Safe string with HTML entities escaped
 */
export function sanitizeHtml(text: string): string {
    if (typeof text !== 'string') return '';

    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Sanitizes a URL to prevent javascript: and data: protocol attacks.
 * Returns empty string for unsafe URLs.
 * 
 * @param url - URL to validate
 * @returns Safe URL or empty string
 */
export function sanitizeUrl(url: string): string {
    if (typeof url !== 'string') return '';

    const trimmed = url.trim().toLowerCase();

    // Block dangerous protocols
    if (trimmed.startsWith('javascript:') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('vbscript:')) {
        return '';
    }

    return url;
}

/**
 * Sanitizes a filename to prevent path traversal attacks.
 * Removes dangerous characters and path components.
 * 
 * @param filename - User-provided filename
 * @returns Safe filename
 */
export function sanitizeFilename(filename: string): string {
    if (typeof filename !== 'string') return 'file';

    return filename
        .replace(/\.\./g, '')           // Remove path traversal
        .replace(/[/\\:*?"<>|]/g, '_')  // Replace dangerous chars
        .slice(0, 255);                  // Limit length
}
