import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: false,
  envDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [tailwindcss()],
  build: {
    minify: true,
    outDir: 'shared/dist',
    lib: {
      entry: {
        'login': 'auth/login.tsx',
        'awaiting-approval': 'onboarding/awaiting-approval.tsx',
        'select-role': 'onboarding/select-role.tsx',
        'student-dashboard': 'student/dashboard.tsx',
        'teacher-dashboard': 'faculty/teacher-dashboard.tsx',
        'dean-dashboard': 'faculty/dean-dashboard.tsx',
        'registrar-dashboard': 'staff/registrar-dashboard.tsx',
        'staff-dashboard': 'staff/staff-dashboard.tsx',
        'admin-dashboard': 'admin/admin-dashboard.tsx',
        'enrollment-requests': 'staff/enrollment-requests.tsx',
      },
      formats: ['es'],
      fileName: (_format, entry) => `${entry}.js`,
      cssFileName: 'portal',
    },
  },
});
