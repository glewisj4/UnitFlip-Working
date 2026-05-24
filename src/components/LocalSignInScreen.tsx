import React, { useMemo, useState } from 'react';
import { Role } from '../core/models/auth';
import { useAppContext } from '../core/hooks/useAppContext';

const LOCAL_ROLE_OPTIONS: Array<{
  role: Role;
  title: string;
  description: string;
}> = [
  {
    role: 'developer',
    title: 'Developer',
    description: 'Full local access including seed controls and developer-only tools.',
  },
  {
    role: 'admin',
    title: 'Admin',
    description: 'Full operational access without developer-only tooling.',
  },
  {
    role: 'manager',
    title: 'Manager',
    description: 'Operational access for portfolio, inspection, and procurement workflows without system-level configuration tools.',
  },
  {
    role: 'vendor',
    title: 'Vendor',
    description: 'Restricted procurement-facing access for the current local build.',
  },
];

const DEMO_USERS: Array<{ label: string; displayName: string; role: Role }> = [
  { label: 'Developer Demo', displayName: 'Devon Developer', role: 'developer' },
  { label: 'Admin Demo', displayName: 'Addison Admin', role: 'admin' },
  { label: 'Manager Demo', displayName: 'Morgan Manager', role: 'manager' },
  { label: 'Vendor Demo', displayName: 'Val Vendor', role: 'vendor' },
];

export const LocalSignInScreen: React.FC = () => {
  const { signInLocal } = useAppContext();
  const [organizationName, setOrganizationName] = useState('My Organization');
  const [displayName, setDisplayName] = useState('Devon Developer');
  const [selectedRole, setSelectedRole] = useState<Role>('developer');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedRoleCopy = useMemo(
    () => LOCAL_ROLE_OPTIONS.find((option) => option.role === selectedRole),
    [selectedRole],
  );

  const handleDemoUserSelect = (value: string) => {
    const matchedDemoUser = DEMO_USERS.find((user) => user.displayName === value);
    if (!matchedDemoUser) return;

    setDisplayName(matchedDemoUser.displayName);
    setSelectedRole(matchedDemoUser.role);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!displayName.trim() || !organizationName.trim()) {
      setErrorMessage('Enter an organization and display name to continue.');
      return;
    }

    setIsSigningIn(true);
    setErrorMessage(null);

    try {
      await signInLocal({
        displayName,
        orgName: organizationName,
        role: selectedRole,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Local sign-in failed.');
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr,0.9fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lowes-blue text-lg font-bold text-white">
            UF
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Local Access</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Sign in to UnitFlip locally.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            This is an offline-first local session shell for development and staged role testing. It is intentionally local
            only, uses browser persistence, and stays compatible with a future organization/user/role/permissions/identity
            model.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {LOCAL_ROLE_OPTIONS.map((option) => (
              <div
                key={option.role}
                className={`rounded-2xl border p-4 ${
                  selectedRole === option.role ? 'border-sky-400 bg-sky-500/10' : 'border-slate-800 bg-slate-950/60'
                }`}
              >
                <p className="text-sm font-semibold text-white">{option.title}</p>
                <p className="mt-2 text-sm text-slate-400">{option.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-900 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Session Setup</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Local role-based sign-in</h2>
          <p className="mt-2 text-sm text-slate-500">
            Choose a demo user or enter a display name, set the organization context, then select the local role for this
            session.
          </p>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Local demo user</span>
              <select
                aria-label="Local demo user"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-lowes-blue"
                onChange={(event) => handleDemoUserSelect(event.target.value)}
                value={displayName}
              >
                {DEMO_USERS.map((user) => (
                  <option key={user.displayName} value={user.displayName}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Organization</span>
              <input
                aria-label="Organization"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-lowes-blue"
                placeholder="My Organization"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Display name</span>
              <input
                aria-label="Display name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-lowes-blue"
                placeholder="Devon Developer"
              />
            </label>

            <fieldset>
              <legend className="mb-3 text-sm font-medium text-slate-700">Role</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {LOCAL_ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.role}
                    type="button"
                    onClick={() => setSelectedRole(option.role)}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      selectedRole === option.role
                        ? 'border-lowes-blue bg-blue-50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-sm font-semibold">{option.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{option.role}</div>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Selected role</p>
              <p className="mt-1">{selectedRoleCopy?.description}</p>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
            ) : null}

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full rounded-2xl bg-lowes-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningIn ? 'Signing In…' : 'Sign In Locally'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
