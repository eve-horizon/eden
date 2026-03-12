import { LoginForm } from '../components/auth/LoginForm';

interface LoginPageProps {
  onLoginWithToken: (token: string) => void;
  onStartSsoLogin: () => void;
  loading: boolean;
  error: string | null;
}

export function LoginPage({
  onLoginWithToken,
  onStartSsoLogin,
  loading,
  error,
}: LoginPageProps) {
  return (
    <LoginForm
      onLoginWithToken={onLoginWithToken}
      onStartSsoLogin={onStartSsoLogin}
      loading={loading}
      error={error}
    />
  );
}
