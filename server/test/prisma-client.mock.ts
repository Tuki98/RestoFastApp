// Shim del cliente Prisma generado para las pruebas unitarias.
// Evita que Jest intente resolver los imports internos con extensión .js
// del cliente generado (client.ts -> ./internal/class.js).

export const Prisma = {
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    meta?: unknown;

    constructor(
      message: string,
      options: { code: string; clientVersion: string; meta?: unknown },
    ) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
      this.code = options.code;
      this.clientVersion = options.clientVersion;
      this.meta = options.meta;
    }
  },
};

export class PrismaClient {
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $on = jest.fn();
  $use = jest.fn();
  $transaction = jest.fn((cb: (client: unknown) => unknown) => cb(this));
}
