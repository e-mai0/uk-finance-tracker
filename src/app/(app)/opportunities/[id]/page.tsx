import { permanentRedirect } from "next/navigation";

export default async function OpportunityRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/tracker/${id}`);
}
