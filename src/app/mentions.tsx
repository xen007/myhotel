import { VisitLegal } from '@/components/visit/visit-legal';
import { VisitPage } from '@/components/visit/visit-page';

export default function MentionsScreen() {
  return (
    <VisitPage>
      {(data) => <VisitLegal kind="mentions" company={data.company} />}
    </VisitPage>
  );
}
