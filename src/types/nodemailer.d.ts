// Minimal nodemailer type stub — @types/nodemailer can't be installed
// locally (npm cache permission issue) but the surface we use is tiny.
declare module "nodemailer" {
  export interface Transporter {
    sendMail(options: {
      from: string;
      to: string | string[];
      subject: string;
      text?: string;
      html?: string;
    }): Promise<{ messageId?: string | null }>;
  }

  export interface TransportOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
  }

  export function createTransport(opts: TransportOptions): Transporter;

  const _default: {
    createTransport(opts: TransportOptions): Transporter;
  };
  export default _default;
}
