import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ApiProvider } from '../contexts/ApiContext';
import { useApi } from '../contexts/ApiContext';
import { Text, TouchableOpacity } from 'react-native';
import apiService from '../services/api';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
  },
}));

// Mock apiService
jest.mock('../services/api', () => {
  const mockApi = {
    setToken: jest.fn(),
    getToken: jest.fn(),
    clearToken: jest.fn(),
    getMe: jest.fn().mockResolvedValue({ ok: true, data: { fullname: 'Initial Name', account_type: 'agent' } }),
    updateMe: jest.fn(),
    getPropertyById: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockApi,
    apiService: mockApi
  };
});

const TestHelper = () => {
  const { updateMe, error, user } = useApi();
  return (
    <>
      <Text testID="error-message">{error || 'No Error'}</Text>
      <Text testID="user-name">{user?.fullname || ''}</Text>
      <TouchableOpacity testID="update-btn" onPress={() => updateMe({ fullname: 'New Name' })}>
        <Text>Update</Text>
      </TouchableOpacity>
    </>
  );
};

describe('ApiContext Error Handling Fix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse complex validation errors into readable strings', async () => {
    // Mock 422 error
    (apiService.updateMe as jest.Mock).mockResolvedValue({
      ok: false,
      error: {
        detail: [
          { loc: ['body', 'phone_number'], msg: 'String should match pattern', type: 'value_error' },
          { loc: ['body', 'account_type'], msg: 'field required', type: 'value_error' }
        ]
      },
      status: 422
    });

    let component: any;
    await act(async () => {
      component = renderer.create(
        <ApiProvider>
          <TestHelper />
        </ApiProvider>
      );
    });

    const updateBtn = component.root.findByProps({ testID: 'update-btn' });
    
    await act(async () => {
      try {
        await updateBtn.props.onPress();
      } catch (e) {
        // Expected to throw
      }
    });

    const errorMsg = component.root.findByProps({ testID: 'error-message' });
    // Should contain both field errors joined by comma
    expect(errorMsg.props.children).toContain('phone_number: String should match pattern');
    expect(errorMsg.props.children).toContain('account_type: field required');
  });

  it('should handle string details in errors', async () => {
    (apiService.updateMe as jest.Mock).mockResolvedValue({
      ok: false,
      error: {
        detail: "Something went wrong"
      },
      status: 400
    });

    let component: any;
    await act(async () => {
      component = renderer.create(
        <ApiProvider>
          <TestHelper />
        </ApiProvider>
      );
    });

    const updateBtn = component.root.findByProps({ testID: 'update-btn' });
    
    await act(async () => {
      try {
        await updateBtn.props.onPress();
      } catch (e) {}
    });

    const errorMsg = component.root.findByProps({ testID: 'error-message' });
    expect(errorMsg.props.children).toBe('Something went wrong');
  });
});
