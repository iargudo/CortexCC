/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_SOCKET_PATH: string;
  readonly VITE_TENANT_KEY?: string;
  readonly VITE_TENANT_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
