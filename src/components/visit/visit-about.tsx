import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { VisitKicker, VisitLead, VisitSection, VisitTitle } from '@/components/visit/visit-kit';
import { Brand } from '@/constants/config';
import { Palette } from '@/constants/theme';
import type { VisitPayload } from '@/hooks/use-visit';

export function VisitAbout({ data }: { data: VisitPayload }) {
  const company = data.company;
  const hotel = company?.name || Brand.name;
  const photo = data.rooms.find((row) => row.photo)?.photo;
  const place = [company?.address, 'Bertoua', 'Cameroun'].filter(Boolean).join(', ');

  return (
    <View>
      {photo ? <Image source={{ uri: photo }} style={styles.hero} contentFit="cover" /> : null}
      <VisitSection>
        <VisitKicker>Notre hôtel</VisitKicker>
        <VisitTitle>{hotel}, 4 étoiles.</VisitTitle>
        <VisitLead>
          {company?.slogan || Brand.tagline}. L’établissement accueille ses hôtes dans un cadre pensé pour le calme,
          la précision du service et la qualité des chambres.
        </VisitLead>
        <Text style={styles.body}>
          Derrière le standing 4 étoiles : une réception présente, des étages soignés, une table tenue. Les informations
          publiées ici — adresse, contacts, chambres, services — sont celles de l’hôtel.
        </Text>
        {place ? <Text style={styles.place}>{place}</Text> : null}
        {company?.legal_name ? <Text style={styles.meta}>{company.legal_name}</Text> : null}
      </VisitSection>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 320, backgroundColor: Palette.ink },
  body: { color: Palette.ink, opacity: 0.75, fontSize: 16, lineHeight: 26, maxWidth: 680 },
  place: { color: Palette.ink, fontWeight: '800', fontSize: 16, marginTop: 8 },
  meta: { color: Palette.ink, opacity: 0.6 },
});
