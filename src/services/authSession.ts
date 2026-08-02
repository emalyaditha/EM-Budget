let inMemorySessionToken: string | null = null;
let inMemoryUserEmail: string | null = null;
let inMemoryDeviceToken: string | null = null;

export const authSession = {
  getToken: (): string | null => inMemorySessionToken,
  setToken: (token: string | null) => {
    inMemorySessionToken = token;
  },
  getEmail: (): string | null => inMemoryUserEmail,
  setEmail: (email: string | null) => {
    inMemoryUserEmail = email;
  },
  getDeviceToken: (): string | null => inMemoryDeviceToken,
  setDeviceToken: (token: string | null) => {
    inMemoryDeviceToken = token;
  },
  clear: () => {
    inMemorySessionToken = null;
    inMemoryUserEmail = null;
    inMemoryDeviceToken = null;
  }
};
