declare module 'sentry-expo' {
  export type InitOptions = Record<string, unknown>;

  export const Native: {
    setTag?: (key: string, value: string) => void;
    captureException?: (error: unknown) => void;
    captureMessage?: (message: string) => void;
  };

  export function init(options: InitOptions): void;
  export function captureException(error: unknown): void;
  export function captureMessage(message: string): void;
  export function configureScope(callback: (scope: unknown) => void): void;
}
