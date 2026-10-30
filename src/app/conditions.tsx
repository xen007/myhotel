import { VisitLegal } from '@/components/visit/visit-legal';
import { VisitPage } from '@/components/visit/visit-page';

export default function ConditionsScreen() {
  return (
    <VisitPage>
      {(data) => <VisitLegal kind="conditions" company={data.company} />}
    </VisitPage>
  );
}
