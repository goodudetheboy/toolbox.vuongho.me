import { signOut } from '../lib/auth';
import type { Route } from '../lib/router';
import { t } from '../strings';
import Menu from './Menu';
import { Icon } from './Scrap';

/** Top right of Home: her Google name, then a person button with How it works, Feedback, Admin (admin only) and Sign out. */
export default function AccountMenu({
  name,
  admin,
  navigate,
}: {
  name: string;
  admin: boolean;
  navigate: (r: Route) => void;
}) {
  return (
    <span className="account">
      <span className="account-name" title={name}>
        {name}
      </span>
      <Menu
        trigger={{ icon: <Icon name="user" size={26} />, label: t.account }}
        items={[
          { label: t.howItWorks, icon: <Icon name="book" size={20} />, onSelect: () => navigate({ name: 'howItWorks' }) },
          { label: t.sendFeedback, icon: <Icon name="chat" size={20} />, onSelect: () => navigate({ name: 'sendFeedback' }) },
          ...(admin
            ? [{ label: t.admin.title, icon: <Icon name="shield" size={20} />, onSelect: () => navigate({ name: 'admin', tab: 'feedback' }) }]
            : []),
          { label: t.signOut, icon: <Icon name="logout" size={20} />, onSelect: () => void signOut() },
        ]}
      />
    </span>
  );
}
