import { useEffect, useState } from "react";

import {
  fetchUserProfilesBatch,
  getFileUrl,
  type UserProfile,
} from "@/shared/utils/api";

import type { Project } from "@/app/contexts/DataProvider";
import type { TeamMember } from "../types";

const teamMembersCache = new Map<string, TeamMember[]>();

export function useTeamMembers(project: Project | null) {
  const activeProjectId = project?.projectId;

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    if (activeProjectId && teamMembersCache.has(activeProjectId)) {
      return teamMembersCache.get(activeProjectId) as TeamMember[];
    }
    return [];
  });

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!activeProjectId || !project || !Array.isArray(project.team)) {
        if (isMounted) {
          setTeamMembers([]);
          if (activeProjectId) {
            teamMembersCache.set(activeProjectId, []);
          }
        }
        return;
      }

      try {
        const ids = project.team.map((member) => member.userId);
        const profiles = await fetchUserProfilesBatch(ids);
        const map = new Map(profiles.map((p: UserProfile) => [p.userId, p]));
        const results: TeamMember[] = project.team.map((member) => {
          const profile = map.get(member.userId) || ({} as Partial<UserProfile>);
          return {
            userId: member.userId,
            firstName: (profile.firstName as string) || "",
            lastName: (profile.lastName as string) || "",
            thumbnail: (profile.thumbnail as string) || null,
          };
        });
        if (isMounted) {
          setTeamMembers(results);
          teamMembersCache.set(activeProjectId, results);
        }
      } catch {
        if (isMounted) {
          setTeamMembers([]);
          teamMembersCache.set(activeProjectId || "", []);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [activeProjectId, project]);

  useEffect(() => {
    teamMembers.forEach((member) => {
      if (member.thumbnail) {
        const img = new Image();
        img.src = getFileUrl(member.thumbnail);
      }
    });
  }, [teamMembers]);

  return teamMembers;
}
