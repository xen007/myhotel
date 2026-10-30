import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AuthButton } from '@/components/auth/auth-button';
import { AuthField } from '@/components/auth/auth-field';
import { AuthShell } from '@/components/auth/auth-shell';
import { Palette } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useVisitCart } from '@/context/visit-cart';
import { submitVisitCart } from '@/lib/visit-checkout';
import { takeVisitNext } from '@/lib/visit-intent';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function LoginScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const { login, user, ready } = useAuth();
  const cart = useVisitCart();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (ready && user) {
    return <Redirect href="/home" />;
  }

  async function onSubmit() {
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Veuillez renseigner votre e-mail et votre mot de passe.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Adresse e-mail invalide.');
      return;
    }

    setLoading(true);
    try {
      const payload = await login(trimmedEmail, password);
      if (payload.user.role === 'client' && cart.lines.length) {
        try {
          await submitVisitCart(payload.token, cart.lines);
          cart.clear();
        } catch {
          /* le panier reste disponible */
        }
      }
      await takeVisitNext();
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Text style={[styles.title, compact && styles.titleSm]}>Connexion</Text>
      <Text style={styles.lead}>Accédez à votre espace client.</Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <AuthField
        icon="person"
        placeholder="Adresse e-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading}
      />
      <AuthField
        icon="lock"
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        editable={!loading}
        onSubmitEditing={() => void onSubmit()}
      />

      <Pressable
        onPress={() => {
          const title = 'Mot de passe oublié';
          const message = 'Contactez la réception de l’hôtel pour réinitialiser votre accès.';
          if (Platform.OS === 'web') {
            globalThis.alert(`${title}\n\n${message}`);
            return;
          }
          Alert.alert(title, message);
        }}>
        <Text style={styles.help}>Mot de passe oublié ?</Text>
      </Pressable>

      <AuthButton label="Se connecter" loading={loading} onPress={onSubmit} />

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Pas encore de compte ? </Text>
        <Pressable onPress={() => router.push('/register')} disabled={loading}>
          <Text style={styles.switchLink}>S’inscrire</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    color: Palette.ink,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    alignSelf: 'center',
    marginTop: 2,
  },
  titleSm: {
    fontSize: 20,
  },
  lead: {
    color: Palette.ink,
    opacity: 0.62,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 2,
  },
  help: {
    color: Palette.ink,
    opacity: 0.7,
    fontSize: 13,
    textAlign: 'right',
  },
  errorBox: {
    borderWidth: 1,
    borderColor: Palette.ink,
    borderRadius: 10,
    padding: 8,
    backgroundColor: Palette.white,
  },
  errorText: {
    color: Palette.ink,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  switchText: {
    color: Palette.ink,
    fontSize: 13,
  },
  switchLink: {
    color: Palette.gold,
    fontSize: 13,
    fontWeight: '800',
  },
});
