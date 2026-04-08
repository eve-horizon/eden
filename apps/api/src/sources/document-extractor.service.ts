import { Injectable, Logger } from '@nestjs/common';

// pdf-parse exposes a debug check on its index.js that tries to read a test
// fixture from disk. Importing the inner module skips that check.
import pdf from 'pdf-parse/lib/pdf-parse.js';
import * as mammoth from 'mammoth';

// ---------------------------------------------------------------------------
// DocumentExtractorService — extracts plain text from uploaded sources
//
// Used by the wizard to enrich the map-generator prompt with the contents of
// an attached document. Supported types: text/* (passthrough), PDF via
// pdf-parse, DOCX via mammoth. Anything else returns undefined.
//
// Always returns at most `maxBytes` characters (default 8KB) so the prompt
// never balloons. Truncation is marked with a trailing "[...truncated]" tag
// so the agent knows the content was clipped.
// ---------------------------------------------------------------------------

type Kind = 'text' | 'pdf' | 'docx' | 'unsupported';

export interface ExtractableSource {
  filename: string;
  content_type: string | null;
  download_url: string | null;
}

export interface ExtractOptions {
  maxBytes?: number;
}

@Injectable()
export class DocumentExtractorService {
  private readonly logger = new Logger(DocumentExtractorService.name);
  private readonly eveServiceToken = process.env.EVE_SERVICE_TOKEN;

  async extract(
    source: ExtractableSource,
    opts: ExtractOptions = {},
  ): Promise<string | undefined> {
    if (!source.download_url) return undefined;

    const maxBytes = opts.maxBytes ?? 8 * 1024;
    const kind = this.classify(source);

    if (kind === 'unsupported') {
      this.logger.debug(
        `Unsupported source kind for ${source.filename} (content_type=${source.content_type ?? 'none'})`,
      );
      return undefined;
    }

    try {
      const buffer = await this.fetchBuffer(source.download_url);
      const raw = await this.toText(buffer, kind);
      if (!raw) return undefined;

      // Normalize line endings, collapse runs of blank lines, then trim.
      // PDF extraction in particular tends to introduce excessive whitespace.
      const cleaned = raw
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!cleaned) return undefined;

      return cleaned.length > maxBytes
        ? cleaned.slice(0, maxBytes) + '\n\n[...truncated]'
        : cleaned;
    } catch (err) {
      this.logger.warn(
        `Extraction failed for ${source.filename}: ${(err as Error).message}`,
      );
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private classify(source: ExtractableSource): Kind {
    const name = source.filename.toLowerCase();
    const ct = (source.content_type ?? '').toLowerCase();

    if (ct.startsWith('text/') || /\.(md|txt|markdown)$/.test(name)) {
      return 'text';
    }
    if (ct === 'application/pdf' || name.endsWith('.pdf')) {
      return 'pdf';
    }
    if (
      ct ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ct.includes('wordprocessingml') ||
      name.endsWith('.docx')
    ) {
      return 'docx';
    }
    return 'unsupported';
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const headers: Record<string, string> = {};
    if (this.eveServiceToken) {
      headers['Authorization'] = `Bearer ${this.eveServiceToken}`;
    }

    const response = await fetch(url, { headers, redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`fetch ${url} returned ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async toText(buffer: Buffer, kind: Kind): Promise<string> {
    switch (kind) {
      case 'text':
        return buffer.toString('utf8');
      case 'pdf': {
        const result = await pdf(buffer);
        return result.text ?? '';
      }
      case 'docx': {
        const result = await mammoth.extractRawText({ buffer });
        return result.value ?? '';
      }
      default:
        return '';
    }
  }
}
