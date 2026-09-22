import type { Activity } from '../types';

interface ActivityCardProps {
  activity: Activity;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ActivityCard({ activity, onEdit, onDelete }: ActivityCardProps) {
  return (
    <li className="activity-card">
      <div className="activity-time">
        {activity.startTime}
        {'–'}
        {activity.endTime}
      </div>
      <div className="activity-body">
        <div className="activity-header">
          <span className="activity-title">{activity.title}</span>
          <span className={`category-badge category-${activity.category}`}>
            {activity.category}
          </span>
        </div>
        {activity.description && <p className="activity-description">{activity.description}</p>}
        {activity.tags.length > 0 && (
          <ul className="tag-list">
            {activity.tags.map((tag) => (
              <li key={tag} className="tag">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="activity-actions">
        <button className="icon-button" aria-label={`Edit ${activity.title}`} onClick={onEdit}>
          ✎
        </button>
        <button className="icon-button" aria-label={`Delete ${activity.title}`} onClick={onDelete}>
          ✕
        </button>
      </div>
    </li>
  );
}
