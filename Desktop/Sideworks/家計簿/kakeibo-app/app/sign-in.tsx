import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/providers/AuthProvider';

export default function SignInScreen() {
  const { signIn, session, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // セッションが取得できたら画面遷移を副作用で行う
  useEffect(() => {
    if (session) {
      router.replace('/');
    }
  }, [session, router]);

  if (session) return null;

  const onSignIn = async () => {
    if (!email || !password) {
      Alert.alert('メールとパスワードを入力してください');
      return;
    }
    await signIn({ email, password });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>家計簿にサインイン</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="メールアドレス"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="パスワード"
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={onSignIn} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? '処理中...' : 'ログイン'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 80,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
  },
  button: {
    backgroundColor: '#2f95dc',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
