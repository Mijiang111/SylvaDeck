import { Navigate, Route, Routes, useParams } from "@/lib/router";
import { StudioShellPage } from "@/features/studio/StudioShellPage";
import { StudioModuleAuthorPage } from "@/features/studio/StudioModuleAuthorPage";
import { StudioModuleDetailPage } from "@/features/studio/StudioModuleDetailPage";
import { StudioModuleLibraryPage } from "@/features/studio/StudioModuleLibraryPage";
import { StudioProjectEditPage } from "@/features/studio/StudioProjectEditPage";
import { StudioPublishedPage } from "@/features/report/StudioPublishedPage";

function PublishedRoute() {
  const params = useParams();
  return <StudioPublishedPage projectId={params.projectId ?? ""} />;
}

function ProjectEditRoute() {
  const params = useParams();
  return <StudioProjectEditPage projectId={params.projectId ?? ""} />;
}

function ModuleDetailRoute() {
  const params = useParams();
  return <StudioModuleDetailPage moduleId={params.moduleId ?? ""} />;
}

export function App() {
  return (
    <Routes>
      <Route index element={<StudioShellPage />} />
      <Route path="templates" element={<StudioModuleLibraryPage />} />
      <Route path="templates/new" element={<StudioModuleAuthorPage />} />
      <Route path="templates/packs/:packId" element={<Navigate to="/templates/new?import=1" replace />} />
      <Route path="templates/legacy/new" element={<StudioModuleAuthorPage />} />
      <Route path="templates/legacy/:moduleId/edit" element={<StudioModuleAuthorPage />} />
      <Route path="templates/:moduleId" element={<ModuleDetailRoute />} />
      <Route path="templates/:moduleId/edit" element={<StudioModuleAuthorPage />} />
      <Route path="modules" element={<StudioModuleLibraryPage />} />
      <Route path="modules/new" element={<StudioModuleAuthorPage />} />
      <Route path="modules/:moduleId" element={<ModuleDetailRoute />} />
      <Route path="modules/:moduleId/edit" element={<StudioModuleAuthorPage />} />
      <Route path="projects/:projectId/edit" element={<ProjectEditRoute />} />
      <Route path="projects/:projectId/published" element={<PublishedRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
