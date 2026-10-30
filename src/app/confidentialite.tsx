import { VisitLegal } from '@/components/visit/visit-legal';
import { VisitPage } from '@/components/visit/visit-page';

export default function ConfidentialiteScreen() {
  return (
    <VisitPage>
      {(data) => <VisitLegal kind="confidentialite" company={data.company} />}
    </VisitPage>
  );
}
