'use client';

import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm mode="register" />
    </Suspense>
  );
}
