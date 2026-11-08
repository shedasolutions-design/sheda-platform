// @ts-nocheck — Test file with Jest mocks
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ApiProvider } from '../contexts/ApiContext';
import { useAuth } from '../hooks/useShedaApi';
import { Text } from 'react-native';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => {
    if (key === 'auth_token') return Promise.resolve('mock_token');
    if (key === 'user_data') return Promise.resolve(JSON.stringify({ id: 1, username: 'dev_user' }));
    return Promise.resolve(null);
  }),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock apiService
jest.mock('../services/api', () => ({
  __esModule: true,
  // ApiContext now connects its WebSocket for the whole authenticated
  // session (not just while the chat screen happens to be open), so this
  // mock module needs to carry API_BASE_URL too — this test renders a real
  // ApiProvider with a mock-authenticated user, which now reaches that code
  // path and previously crashed on `undefined.replace(...)`.
  API_BASE_URL: 'https://sheda-backend-1.onrender.com',
  default: {
    setToken: jest.fn(),
    getMe: jest.fn(() => Promise.resolve({ ok: true, data: { id: 1, username: 'dev_user' } })),
    clearToken: jest.fn(),
  },
  apiService: {
    setToken: jest.fn(),
    getMe: jest.fn(() => Promise.resolve({ ok: true, data: { id: 1, username: 'dev_user' } })),
    clearToken: jest.fn(),
  }
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
  },
}));

// useAuth() (hooks/useShedaApi.ts) now disconnects the wallet as part of
// logout, so it calls useWallet() — mock it out here since this test never
// renders a WalletProvider, and the real module's FastAuth import chain
// isn't transformable under this project's current Jest config anyway.
jest.mock('../contexts/WalletContext', () => ({
  useWallet: () => ({ signOut: jest.fn(() => Promise.resolve()) }),
}));

// Test component to access the hook
const TestComponent = () => {
  const { isAuthenticated, user } = useAuth();
  return (
    <>
      <Text testID="auth-status">{isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</Text>
      <Text testID="user-name">{user?.username || 'No User'}</Text>
    </>
  );
};

describe('Authentication Bypass', () => {
  it('should be authenticated by default with mock user', async () => {
    let component;

    await act(async () => {
      component = renderer.create(
        <ApiProvider>
          <TestComponent />
        </ApiProvider>
      );
      // Allow async initializeApp to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const root = component.root;

    const authStatus = root.findByProps({ testID: 'auth-status' });
    const userName = root.findByProps({ testID: 'user-name' });

    expect(authStatus.props.children).toBe('Authenticated');
    expect(userName.props.children).toBe('dev_user');
  });
});
