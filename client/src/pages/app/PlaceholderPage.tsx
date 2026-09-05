function PlaceholderPage({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-muted-foreground">
        {description ?? 'Este módulo se construirá en una próxima fase.'}
      </p>
    </div>
  )
}

export default PlaceholderPage
