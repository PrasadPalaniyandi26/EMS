import { BadRequestException } from '@nestjs/common';

// Receipts and client PO files are opened in the viewer's browser, so the type comes from the bytes, never from the
// sender's file name or declared type: a page named as an image would run as the app.
export const TYPE_BY_EXT: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

export function sniffExt(b: Buffer): '.pdf' | '.jpg' | '.png' | '.gif' | '.webp' | null {
  const at = (offset: number, text: string) => b.subarray(offset, offset + text.length).toString('latin1') === text;
  if (at(0, '%PDF-')) return '.pdf';
  if (at(0, '\xff\xd8\xff')) return '.jpg';
  if (at(0, '\x89PNG\r\n\x1a\n')) return '.png';
  if (at(0, 'GIF87a') || at(0, 'GIF89a')) return '.gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return '.webp';
  return null;
}

export const uploadedBy = (name: string, userId: number) => name.startsWith(`u${userId}-`);

// A record may keep the file it already has, or take one this user uploaded. Anything else could name another
// website (the browser would send it the viewer's token) or another person's file.
export function assertOwnAttachment(next: unknown, current: string | null | undefined, userId: number) {
  if (next === undefined || next === null || next === '' || next === current) return;
  if (typeof next !== 'string' || !uploadedBy(next, userId) || !/^u\d+-[0-9a-f-]{36}\.(pdf|jpg|png|gif|webp)$/.test(next)) {
    throw new BadRequestException('Attach the file by uploading it again.');
  }
}
