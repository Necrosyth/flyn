import AppLayout from "@/components/AppLayout";
import { UnifiedInbox } from "@/features/unifiedInbox/UnifiedInbox";

const Inbox = () => (
  <AppLayout>
    {/* Cancel AppLayout's p-4 sm:p-6 padding and fill header-to-bottom */}
    <div
      className="-mx-4 -my-4 sm:-mx-6 sm:-my-6"
      style={{ height: "calc(100vh - 56px)" }}
    >
      <UnifiedInbox />
    </div>
  </AppLayout>
);

import { withPlanGate } from "@/components/PlanGate";
export default withPlanGate("channels.inbox")(Inbox);
