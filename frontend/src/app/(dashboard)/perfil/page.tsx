export default function PerfilPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Revisa tus datos, ELO y preferencias de entrenamiento.
        </p>
      </div>
      <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-slate-900">
        <p className="text-sm text-muted-foreground">
          La información del perfil se conectará con el endpoint de usuario del backend.
        </p>
      </div>
    </div>
  );
}
