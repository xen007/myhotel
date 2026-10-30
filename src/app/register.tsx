import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AuthButton } from '@/components/auth/auth-button';
import { AuthField } from '@/components/auth/auth-field';
import { AuthPhone } from '@/components/auth/auth-phone';
import { AuthShell } from '@/components/auth/auth-shell';
import { Palette } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useVisitCart } from '@/context/visit-cart';
import { submitVisitCart } from '@/lib/visit-checkout';
import { takeVisitNext } from '@/lib/visit-intent';
import { detectDialCountry, e164, isValidNational } from '@/lib/phone';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function RegisterScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const { register, user, ready } = useAuth();
  const cart = useVisitCart();
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(detectDialCountry);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hint = useMemo(() => `+${country.dial} · ${country.name}`, [country]);

  if (ready && user) {
    return <Redirect href="/home" />;
  }

  async function onSubmit() {
    setError(null);
    const nom = lastName.trim();
    const prenom = firstName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (nom.length < 2) {
      setError('Indiquez votre nom.');
      return;
    }
    if (prenom.length < 2) {
      setError('Indiquez votre prénom.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Adresse e-mail invalide.');
      return;
    }
    if (!isValidNational(phone, country)) {
      setError(`Numéro ${country.name} invalide (${hint}).`);
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const payload = await register({
        full_name: `${prenom} ${nom}`,
        email: trimmedEmail,
        phone: e164(phone, country),
        password,
      });
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
      setError(err instanceof Error ? err.message : 'Inscription impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Text style={[styles.title, compact && styles.titleSm]}>Inscription</Text>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Nom</Text>
        <AuthField
          icon="person"
          placeholder="Nom"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          editable={!loading}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Prénom</Text>
        <AuthField
          icon="person"
          placeholder="Prénom"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          editable={!loading}
        />
      </View>
      <AuthField
        icon="mail"
        placeholder="Adresse e-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading}
      />
      <AuthPhone country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} editable={!loading} />
      <AuthField
        icon="lock"
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password-new"
        textContentType="newPassword"
        editable={!loading}
      />
      <AuthField
        icon="lock"
        placeholder="Confirmer le mot de passe"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="password-new"
        textContentType="newPassword"
        editable={!loading}
        onSubmitEditing={() => void onSubmit()}
      />

      <AuthButton label="Créer mon compte" loading={loading} onPress={onSubmit} />

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Déjà un compte ? </Text>
        <Pressable onPress={() => router.push('/login')} disabled={loading}>
          <Text style={styles.switchLink}>Se connecter</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    color: Palette.ink,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    alignSelf: 'center',
  },
  titleSm: {
    fontSize: 18,
  },
  card: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
    borderRadius: 12,
    padding: 6,
    backgroundColor: Palette.white,
    gap: 4,
  },
  cardLabel: {
    color: Palette.ink,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: Palette.ink,
    borderRadius: 10,
    padding: 6,
    backgroundColor: Palette.white,
  },
  errorText: {
    color: Palette.ink,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  switchText: {
    color: Palette.ink,
    fontSize: 12,
  },
  switchLink: {
    color: Palette.gold,
    fontSize: 12,
    fontWeight: '800',
  },
});
