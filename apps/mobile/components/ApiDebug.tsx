import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert, ScrollView as RNScrollView } from "react-native";
import { apiService, API_BASE_URL } from "../services/api";
import { useAuth } from "../hooks/useShedaApi";
import { useApi } from "../contexts/ApiContext";
import nearWalletService from "../services/nearWallet";

export function ApiDebug() {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>("");
  const { logout, isAuthenticated, user } = useAuth();
  const { token, connectWebSocket, wsStatus } = useApi();

  const testWebSocket = () => {
    setIsTesting(true);
    setTestResult(`Testing WebSocket... Status: ${wsStatus}`);
    try {
      console.log("🧪 Manually triggering WebSocket connection...");
      connectWebSocket();
      setTestResult(`WS Status: ${wsStatus}. Check console for handshake logs.`);
    } catch (error) {
      setTestResult(`WS Error: ${error}`);
    } finally {
      setIsTesting(false);
    }
  };

  const testApiConnection = async () => {
    setIsTesting(true);
    setTestResult("");
    try {
      const result = await apiService.testConnection();
      setTestResult(`API Connection: ${result ? "✅ Success" : "❌ Failed"}`);
      console.log("🧪 API Connection test result:", result);
    } catch (error) {
      setTestResult(`API Connection: ❌ Error - ${error}`);
      console.error("🧪 API Connection test error:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const testSignup = async () => {
    setIsTesting(true);
    setTestResult("");
    try {
      const testEmail = `test${Date.now()}@example.com`;
      const testData = {
        email: testEmail,
        password: "testpass123",
        username: `testuser${Date.now()}`,
        near_account_id: nearWalletService.getPreviewAccountId(testEmail) || `test${Date.now()}.testnet`,
      };
      console.log("🧪 Test signup data:", testData);
      const result = await apiService.signup(testData);
      setTestResult(`Signup: ✅ Success - Check console for details`);
      console.log("🧪 Signup result:", result);
    } catch (error) {
      setTestResult(`Signup: ❌ Error - ${error}`);
      console.error("🧪 Signup test error:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const testLogin = async () => {
    setIsTesting(true);
    setTestResult("");
    try {
      const testCredentials = {
        identifier: "", // Enter test email manually
        password: "",   // Enter test password manually
      };

      console.log("🧪 Test credentials:", testCredentials);

      const result = await apiService.login(
        testCredentials.identifier,
        testCredentials.password
      );
      setTestResult(`Login: ✅ Success - Check console for details`);
      console.log("🧪 Login result:", result);
    } catch (error) {
      setTestResult(`Login: ❌ Error - ${error}`);
      console.error("🧪 Login test error:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const testLogout = async () => {
    setIsTesting(true);
    setTestResult("");
    try {
      await logout();
      setTestResult(`Logout: ✅ Success - User logged out`);
      console.log("🧪 Logout test completed");
    } catch (error) {
      setTestResult(`Logout: ❌ Error - ${error}`);
      console.error("🧪 Logout test error:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const testDirectFetch = async () => {
    setIsTesting(true);
    setTestResult("");
    const url = `${API_BASE_URL}/api/v1/property/get-properties?limit=1`;
    try {
      console.log(`🧪 Testing direct fetch to ${url}...`);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        }
      });
      const data = await response.json();
      setTestResult(`Direct Fetch: ${response.status} ${response.ok ? "✅" : "❌"} - Data received`);
      console.log("🧪 Direct fetch result:", response.status, data);
    } catch (error) {
      setTestResult(`Direct Fetch: ❌ Error - ${error}`);
      console.error("🧪 Direct fetch error:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const testNeverSSL = async () => {
    setIsTesting(true);
    setTestResult("");
    try {
      console.log("🧪 Testing connectivity to neverssl.com (HTTP)...");
      const response = await fetch("http://neverssl.com", { method: "GET" });
      setTestResult(`Cleartext (HTTP): ${response.ok ? "✅ Success" : "❌ Failed"}`);
      console.log("🧪 NeverSSL test result:", response.status);
    } catch (error) {
      setTestResult(`Cleartext (HTTP): ❌ Error - ${error}`);
      console.error("🧪 NeverSSL test error:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const testGoogleConnection = async () => {
    setIsTesting(true);
    setTestResult("");
    try {
      console.log("🧪 Testing connectivity to google.com...");
      const response = await fetch("https://www.google.com", { method: "HEAD" });
      setTestResult(`Internet Connection: ${response.ok ? "✅ Success (Google reachable)" : "❌ Failed"}`);
      console.log("🧪 Google test result:", response.status);
    } catch (error) {
      setTestResult(`Internet Connection: ❌ Error - ${error}`);
      console.error("🧪 Google test error:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const testCloudflareIP = async () => {
    setIsTesting(true);
    setTestResult("");
    try {
      console.log("🧪 Testing connectivity to 1.1.1.1...");
      const response = await fetch("https://1.1.1.1", { method: "HEAD" });
      setTestResult(`IP Connection (1.1.1.1): ${response.ok ? "✅ Success" : "❌ Failed"}`);
      console.log("🧪 Cloudflare IP test result:", response.status);
    } catch (error) {
      setTestResult(`IP Connection (1.1.1.1): ❌ Error - ${error}`);
      console.error("🧪 Cloudflare IP test error:", error);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <RNScrollView style={{ padding: 20, backgroundColor: "#f0f0f0" }}>
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 20 }}>
        API Debug Tools
      </Text>

      <TouchableOpacity
        onPress={testNeverSSL}
        disabled={isTesting}
        style={{
          backgroundColor: "#8E8E93",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Testing..." : "Test HTTP (NeverSSL)"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={testGoogleConnection}
        disabled={isTesting}
        style={{
          backgroundColor: "#5856D6",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Testing..." : "Test Internet (Google)"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={testCloudflareIP}
        disabled={isTesting}
        style={{
          backgroundColor: "#AF52DE",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Test IP (1.1.1.1)" : "Test IP (1.1.1.1)"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={testWebSocket}
        disabled={isTesting || !isAuthenticated}
        style={{
          backgroundColor: "#FF2D55",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting || !isAuthenticated ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Testing..." : "Test WebSocket connection"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={testDirectFetch}
        disabled={isTesting}
        style={{
          backgroundColor: "#FF2D55",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Testing..." : "Test Direct API Fetch"}
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 14, marginBottom: 10, color: "#666" }}>
        Auth Status: {isAuthenticated ? "✅ Logged In" : "❌ Not Logged In"}
      </Text>

      {user && (
        <Text style={{ fontSize: 12, marginBottom: 10, color: "#666" }}>
          User: {user.email || user.username}
        </Text>
      )}

      <TouchableOpacity
        onPress={testApiConnection}
        disabled={isTesting}
        style={{
          backgroundColor: "#007AFF",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Testing..." : "Test API Connection"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={testSignup}
        disabled={isTesting}
        style={{
          backgroundColor: "#34C759",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Testing..." : "Test Signup"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={testLogin}
        disabled={isTesting}
        style={{
          backgroundColor: "#FF9500",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Testing..." : "Test Login"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={testLogout}
        disabled={isTesting || !isAuthenticated}
        style={{
          backgroundColor: isAuthenticated ? "#FF3B30" : "#999",
          padding: 10,
          borderRadius: 5,
          marginBottom: 10,
          opacity: isTesting ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {isTesting ? "Testing..." : "Test Logout"}
        </Text>
      </TouchableOpacity>

      {testResult ? (
        <View
          style={{
            backgroundColor: "white",
            padding: 10,
            borderRadius: 5,
            marginTop: 10,
          }}
        >
          <Text style={{ fontSize: 12 }}>{testResult}</Text>
        </View>
      ) : null}

      <Text style={{ fontSize: 12, marginTop: 20, marginBottom: 40, color: "#666" }}>
        Check the browser console for detailed API request/response logs.
      </Text>
    </RNScrollView>
  );
}
