/**
 * Ports `ra.common.file.Multipart` - a `multipart/form-data` body builder.
 *
 * Like the Java version (whose HTTP transport was commented out) this only
 * accumulates the body string; sending it is the caller's concern.
 */
import { compact } from "./identity.js";
import { randomAlphanumeric } from "./util.js";

const LINE_FEED = "\r\n";

export class Multipart {
  boundary: string;
  charset?: string;
  private bodyText = "";

  constructor(charset?: string, boundary?: string) {
    this.charset = charset;
    this.boundary = boundary ?? randomAlphanumeric(32);
  }

  addFormField(name: string, value: string): void {
    const charset = this.charset ?? "UTF-8";
    this.bodyText += `--${this.boundary}${LINE_FEED}`;
    this.bodyText += `Content-Disposition: form-data; name="${name}"${LINE_FEED}`;
    this.bodyText += `Content-Type: text/plain; charset=${charset}${LINE_FEED}${LINE_FEED}`;
    this.bodyText += value + LINE_FEED;
  }

  addFilePart(fieldName: string, fileName?: string): void {
    this.bodyText += `--${this.boundary}${LINE_FEED}`;
    this.bodyText +=
      fileName !== undefined
        ? `Content-Disposition: file; filename="${fileName}"${LINE_FEED}`
        : `Content-Disposition: file; name="${fieldName}";${LINE_FEED}`;
    this.bodyText += `Content-Type: application/octet-stream${LINE_FEED}`;
    this.bodyText += `Content-Transfer-Encoding: binary${LINE_FEED}${LINE_FEED}`;
  }

  addHeaderField(name: string, value: string): void {
    this.bodyText += `${name}: ${value}${LINE_FEED}`;
  }

  appendRaw(text: string): void {
    this.bodyText += text;
  }

  body(): string {
    return this.bodyText;
  }

  finish(): string {
    return this.bodyText + `--${this.boundary}--${LINE_FEED}`;
  }

  toJSON(): Record<string, unknown> {
    return { boundary: this.boundary, ...compact({ charset: this.charset }) };
  }

  static fromJSON(data: Record<string, unknown>): Multipart {
    return new Multipart(data["charset"] as string | undefined, data["boundary"] as string);
  }
}
