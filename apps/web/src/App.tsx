import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { OpenWorkPage } from './features/open-work/OpenWorkPage';
import { MyClaimsPage } from './features/my-claims/MyClaimsPage';
import { PipelinePage } from './features/pipeline/PipelinePage';
import { MangaListPage } from './features/manga/MangaListPage';
import { MangaDetailPage } from './features/manga/MangaDetailPage';
import { HistoryPage } from './features/history/HistoryPage';
import { TeamPage } from './features/team/TeamPage';
import { UserProfilePage } from './features/user/UserProfilePage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { NotFoundPage } from './features/not-found/NotFoundPage';
import { CalendarPage } from './features/calendar/CalendarPage';

// Admin Pages
import { AdminOverviewPage } from './features/admin/AdminOverviewPage';
import { AdminMangaPage } from './features/admin/AdminMangaPage';
import { AdminAssignmentsPage } from './features/admin/AdminAssignmentsPage';
import { AdminClaimsPage } from './features/admin/AdminClaimsPage';
import { AdminUsersPage } from './features/admin/AdminUsersPage';
import { AdminWorkTypesPage } from './features/admin/AdminWorkTypesPage';
import { AdminDiscordPage } from './features/admin/AdminDiscordPage';
import { AdminAnalyticsPage } from './features/admin/AdminAnalyticsPage';
import { AdminAuditPage } from './features/admin/AdminAuditPage';

export function App() {
  return (
    <Routes>
      {/* Public Authentication */}
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/forgot-password" element={<LoginPage />} />

      {/* Authenticated Workspace App Layout */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/open-work" element={<OpenWorkPage />} />
        <Route path="/my-claims" element={<MyClaimsPage />} />
        <Route path="/my-claims/:id" element={<MyClaimsPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/pipeline/:mangaId/:chapterId" element={<PipelinePage />} />
        <Route path="/pipeline/:chapterId" element={<PipelinePage />} />
        <Route path="/manga" element={<MangaListPage />} />
        <Route path="/manga/:id" element={<MangaDetailPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/users" element={<TeamPage />} />
        <Route path="/users/:identifier" element={<UserProfilePage />} />
        <Route path="/user" element={<UserProfilePage />} />
        <Route path="/user/:identifier" element={<UserProfilePage />} />
        <Route path="/profile" element={<UserProfilePage />} />
        <Route path="/profile/:identifier" element={<UserProfilePage />} />
        <Route path="/team" element={<Navigate to="/users" replace />} />
        <Route path="/team/*" element={<Navigate to="/users" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/deadlines" element={<Navigate to="/calendar" replace />} />
        <Route path="/analytics" element={<AdminAnalyticsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />

        {/* Admin Suite Routes */}
        <Route path="/admin" element={<AdminOverviewPage />} />
        <Route path="/admin/manga" element={<AdminMangaPage />} />
        <Route path="/admin/assignments" element={<AdminAssignmentsPage />} />
        <Route path="/admin/claims" element={<AdminClaimsPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/roles" element={<AdminDiscordPage />} />
        <Route path="/admin/work-types" element={<AdminWorkTypesPage />} />
        <Route path="/admin/templates" element={<AdminWorkTypesPage />} />
        <Route path="/admin/channels" element={<AdminDiscordPage />} />
        <Route path="/admin/discord" element={<AdminDiscordPage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
        <Route path="/admin/audit" element={<AdminAuditPage />} />
      </Route>

      {/* Custom 404 Not Found (No header or go-back button) */}
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
