import { DashboardRuntime } from "@/components/dashboard/runtime"

type DashboardPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { id } = await params

  return <DashboardRuntime dashboardId={id} />
}
