import AppLayout from '../components/AppLayout';
import { useAuth } from '../auth/useAuth';

const rolePageContent = {
  super: {
    title: 'Super dashboard',
    description: 'You are signed in with system-wide access.',
  },
  management: {
    title: 'Management dashboard',
    description: 'You are signed in with cross-unit dashboard access.',
  },
  admin: {
    title: 'Admin tickets',
    description: 'You are signed in with department administration access.',
  },
  team: {
    title: 'Team tickets',
    description: 'You are signed in with department ticket-work access.',
  },
  staff: {
    title: 'My tickets',
    description: 'You are signed in with your staff ticket access.',
  },
};

export default function RoleHomePage() {
  const { user } = useAuth();
  const content = rolePageContent[user.role];

  return (
    <AppLayout>
      <section className="content-card">
        <p className="eyebrow">{user.role}</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        <p className="muted">
          If you are seeing this congrats on maiking it here. But seriously, how did you land up here??<br></br>
          Anywho, since you are here- One, you aren't meant to be here. Two:<br></br>This page is a Pre-planed section closed of to normal users and is part of the future upgrade plan.
          <br></br>Please return to your permitted area. <br></br>Thank You.
        </p>
      </section>
    </AppLayout>
  );
}
