import { AppDetailClient } from './app-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AppDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <AppDetailClient appId={id} />;
}
