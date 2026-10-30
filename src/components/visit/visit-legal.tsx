import { StyleSheet, Text, View } from 'react-native';

import { VisitKicker, VisitLead, VisitSection, VisitTitle } from '@/components/visit/visit-kit';
import { Brand } from '@/constants/config';
import { Palette } from '@/constants/theme';
import type { VisitCompany } from '@/hooks/use-visit';

export function VisitLegal({
  kind,
  company,
}: {
  kind: 'mentions' | 'confidentialite' | 'conditions';
  company: VisitCompany | null;
}) {
  const hotel = company?.name || Brand.name;
  const legal = company?.legal_name || hotel;
  const coords = [company?.address, company?.city, company?.country].filter(Boolean).join(', ');

  if (kind === 'mentions') {
    return (
      <VisitSection>
        <VisitKicker>Informations légales</VisitKicker>
        <VisitTitle>Mentions légales</VisitTitle>
        <VisitLead>Les informations ci-dessous sont celles de l’établissement, lorsqu’elles ont été renseignées.</VisitLead>
        <Text style={styles.p}><Text style={styles.strong}>Enseigne.</Text> {hotel}{company?.slogan ? ` — ${company.slogan}` : ''}.</Text>
        <Text style={styles.p}><Text style={styles.strong}>Raison sociale.</Text> {legal}.</Text>
        {coords ? <Text style={styles.p}><Text style={styles.strong}>Siège / adresse.</Text> {coords}.</Text> : null}
        {company?.phone ? <Text style={styles.p}><Text style={styles.strong}>Téléphone.</Text> {company.phone}</Text> : null}
        {company?.email ? <Text style={styles.p}><Text style={styles.strong}>E-mail.</Text> {company.email}</Text> : null}
        {company?.website ? <Text style={styles.p}><Text style={styles.strong}>Site.</Text> {company.website}</Text> : null}
        {company?.nif ? <Text style={styles.p}><Text style={styles.strong}>NIF.</Text> {company.nif}</Text> : null}
        {company?.rccm ? <Text style={styles.p}><Text style={styles.strong}>RCCM.</Text> {company.rccm}</Text> : null}
        <Text style={styles.p}>
          L’hébergement des données et le fonctionnement de cette vitrine relèvent du système de gestion de l’hôtel.
          Pour toute demande, utilisez le formulaire de contact.
        </Text>
      </VisitSection>
    );
  }

  if (kind === 'confidentialite') {
    return (
      <VisitSection>
        <VisitKicker>Protection des données</VisitKicker>
        <VisitTitle>Politique de confidentialité</VisitTitle>
        <VisitLead>
          Les données collectées via l’inscription, la réservation, la commande ou le formulaire de contact
          servent uniquement à l’accueil, au séjour et au suivi des demandes.
        </VisitLead>
        <Text style={styles.p}>Elles ne sont pas revendues. L’accès est réservé aux équipes habilitées de l’établissement.</Text>
        <Text style={styles.p}>
          Vous pouvez demander l’accès, la rectification ou la suppression de vos informations auprès de la réception
          {company?.email ? ` (${company.email})` : ''}.
        </Text>
      </VisitSection>
    );
  }

  return (
    <VisitSection>
      <VisitKicker>Séjour & commandes</VisitKicker>
      <VisitTitle>Conditions générales</VisitTitle>
      <VisitLead>
        La consultation des chambres, de la carte et de la boutique est libre. La confirmation d’une réservation
        ou d’une commande nécessite un compte client.
      </VisitLead>
      <View style={styles.gap}>
        <Text style={styles.p}>Les tarifs affichés sont ceux enregistrés par l’hôtel au moment de la consultation.</Text>
        <Text style={styles.p}>Une réservation n’est ferme qu’après validation dans l’espace client.</Text>
        <Text style={styles.p}>Les commandes restaurant et boutique sont préparées selon les stocks réellement disponibles.</Text>
        <Text style={styles.p}>
          Pour toute question avant votre arrivée, contactez {hotel}
          {company?.phone ? ` au ${company.phone}` : ''}
          {company?.email ? ` ou ${company.email}` : ''}.
        </Text>
      </View>
    </VisitSection>
  );
}

const styles = StyleSheet.create({
  p: { color: Palette.ink, fontSize: 15, lineHeight: 24, opacity: 0.82, maxWidth: 720 },
  strong: { fontWeight: '800', opacity: 1 },
  gap: { gap: 8 },
});
