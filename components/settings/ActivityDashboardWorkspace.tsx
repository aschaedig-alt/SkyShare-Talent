"use client";

import { useState } from "react";

interface ActivityDashboardWorkspaceProps {
  activityData: {
    total: number;
    byType: Record<string, number>;
    byUser: Record<string, number>;
    recentActivities: Array<{
      id: string;
      activityType: string;
      description: string;
      createdAt: string | Date;
      user?: {
        id: string;
        name: string | null;
        email: string | null;
      };
      userEmail?: string;
    }>;
  };
}

export function ActivityDashboardWorkspace({ activityData }: ActivityDashboardWorkspaceProps) {
  const [filter, setFilter] = useState<string>("all");

  const filteredActivities =
    filter === "all"
      ? activityData.recentActivities
      : activityData.recentActivities.filter((a) => a.activityType === filter);

  const activityTypes = Object.keys(activityData.byType).sort();

  return (
    <div className="space-y-6 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
          Team Activity
        </p>
        <h1 className="text-2xl font-semibold text-brand-lea">Activity Dashboard</h1>
        <p className="mt-1 text-sm text-brand-grey">Track team activity over the last 30 days</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-grey">Total Activities</div>
          <div className="mt-2 text-3xl font-semibold text-brand-lea">{activityData.total}</div>
        </div>
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-grey">Activity Types</div>
          <div className="mt-2 text-3xl font-semibold text-brand-lea">{activityTypes.length}</div>
        </div>
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-grey">Team Members</div>
          <div className="mt-2 text-3xl font-semibold text-brand-lea">{Object.keys(activityData.byUser).length}</div>
        </div>
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-grey">Avg per Person</div>
          <div className="mt-2 text-3xl font-semibold text-brand-lea">
            {Object.keys(activityData.byUser).length > 0
              ? (activityData.total / Object.keys(activityData.byUser).length).toFixed(1)
              : "0"}
          </div>
        </div>
      </div>

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <h2 className="text-lg font-semibold text-brand-lea">Activity Breakdown</h2>
        <div className="mt-4 space-y-2">
          {activityTypes.length > 0 ? (
            activityTypes.map((type) => (
              <div key={type} className="flex items-center justify-between rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3">
                <span className="font-medium text-brand-lea">{type}</span>
                <span className="text-sm font-semibold text-brand-grey">{activityData.byType[type]} events</span>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center p-8">
              <p className="text-brand-grey">No activity data yet</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <h2 className="text-lg font-semibold text-brand-lea">Team Contribution</h2>
        <div className="mt-4 space-y-2">
          {Object.keys(activityData.byUser).length > 0 ? (
            Object.entries(activityData.byUser)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([user, count]) => (
                <div key={user} className="flex items-center justify-between rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3">
                  <span className="font-medium text-brand-lea">{user}</span>
                  <span className="inline-block rounded bg-brand-gold/20 px-2 py-1 text-sm font-semibold text-brand-lea">
                    {count} activities
                  </span>
                </div>
              ))
          ) : (
            <div className="flex items-center justify-center p-8">
              <p className="text-brand-grey">No team members with activity yet</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-brand-lea">Recent Activity</h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded border border-brand-lea/20 bg-white px-3 py-1 text-sm text-brand-lea"
          >
            <option value="all">All Activities</option>
            {activityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 space-y-2">
          {filteredActivities.slice(0, 20).map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3">
              <div className="flex-1">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-gold">
                  {activity.activityType}
                </div>
                <div className="mt-1 text-sm font-medium text-brand-lea">{activity.description}</div>
                <div className="mt-1 text-xs text-brand-grey">
                  {activity.user?.name || activity.userEmail || "Unknown"} •{" "}
                  {new Date(activity.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          {filteredActivities.length === 0 && (
            <div className="flex items-center justify-center p-8">
              <p className="text-brand-grey">No activities found</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
