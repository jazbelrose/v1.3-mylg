import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { ProjectLike } from "@/dashboard/home/hooks/useProjectKpis";

import { createRandomId, getProjectActivityTs } from "../../utils/utils";
import { useDropdown, type DropdownHelpers, type DropdownOption } from "./useDropdown";
import type { ProjectWithMeta } from "../../utils/types";

export type SortOption = "titleAsc" | "titleDesc" | "dateNewest" | "dateOldest";

type UseProjectFiltersArgs = {
  projects: ProjectLike[];
  recentsLimit: number;
  defaultScope?: "recents" | "all";
  defaultSortOption?: SortOption;
  queryMatcher?: (
    project: ProjectWithMeta,
    normalizedQuery: string
  ) => boolean;
  statusFilterPredicate?: (status: string) => boolean;
};

type UseProjectFiltersResult = {
  filtersOpen: boolean;
  toggleFilters: () => void;
  closeFilters: () => void;
  filtersRef: RefObject<HTMLDivElement>;
  filtersId: string;
  scope: "recents" | "all";
  setScope: (scope: "recents" | "all") => void;
  query: string;
  setQuery: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  statusOptions: DropdownOption<string>[];
  statusTriggerLabel: string;
  statusDropdown: DropdownHelpers<string>;
  showStatusDropdown: boolean;
  sortOption: SortOption;
  sortOptions: DropdownOption<SortOption>[];
  sortTriggerLabel: string;
  sortDropdown: DropdownHelpers<SortOption>;
  filteredProjects: ProjectWithMeta[];
};

const SORT_OPTIONS: DropdownOption<SortOption>[] = [
  { value: "titleAsc", label: "Title (A-Z)" },
  { value: "titleDesc", label: "Title (Z-A)" },
  { value: "dateNewest", label: "Date (Newest)" },
  { value: "dateOldest", label: "Date (Oldest)" },
];

export const useProjectFilters = ({
  projects,
  recentsLimit,
  defaultScope = "recents",
  defaultSortOption = "dateNewest",
  queryMatcher,
  statusFilterPredicate,
}: UseProjectFiltersArgs): UseProjectFiltersResult => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scope, setScope] = useState<"recents" | "all">(defaultScope);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>(defaultSortOption);

  const filtersRef = useRef<HTMLDivElement | null>(null);
  const filtersId = useMemo(() => createRandomId("projects-filters"), []);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!filtersOpen) return;
      if (
        filtersRef.current &&
        event.target instanceof Node &&
        !filtersRef.current.contains(event.target)
      ) {
        setFiltersOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [filtersOpen]);

  const toggleFilters = useCallback(() => {
    setFiltersOpen((prev) => !prev);
  }, []);

  const closeFilters = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  const matchQuery = useMemo(
    () =>
      queryMatcher ||
      ((project: ProjectWithMeta, normalizedQuery: string) =>
        (project.title || "").toLowerCase().includes(normalizedQuery)),
    [queryMatcher]
  );

  const shouldIncludeStatus = useMemo(
    () =>
      statusFilterPredicate
        ? statusFilterPredicate
        : () => true,
    [statusFilterPredicate]
  );

  const statuses = useMemo(() => {
    try {
      return Array.from(
        new Set(
          projects
            .map((project) => String(project.status || "").toLowerCase())
            .map((status) => status.trim())
            .filter(Boolean)
            .filter((status) => shouldIncludeStatus(status))
        )
      );
    } catch {
      return [] as string[];
    }
  }, [projects, shouldIncludeStatus]);

  const statusOptions = useMemo<DropdownOption<string>[]>(() => {
    if (!statuses.length) return [{ value: "", label: "All statuses" }];
    return [{ value: "", label: "All statuses" }, ...statuses.map((value) => ({ value, label: value }))];
  }, [statuses]);

  const statusDropdown = useDropdown({
    options: statusOptions,
    selectedValue: statusFilter,
    onSelect: setStatusFilter,
    idPrefix: "projects-status",
  });

  const sortOptions = SORT_OPTIONS;

  const sortDropdown = useDropdown({
    options: sortOptions,
    selectedValue: sortOption,
    onSelect: setSortOption,
    idPrefix: "projects-sort",
  });

  const { close: closeStatusDropdown } = statusDropdown;
  const { close: closeSortDropdown } = sortDropdown;

  useEffect(() => {
    if (!filtersOpen) {
      closeStatusDropdown();
      closeSortDropdown();
    }
  }, [closeSortDropdown, closeStatusDropdown, filtersOpen]);

  const filteredProjects = useMemo<ProjectWithMeta[]>(() => {
    const list: ProjectWithMeta[] = projects.map((project) => ({
      ...(project as ProjectWithMeta),
      _activity: getProjectActivityTs(project),
      _created: new Date(project.dateCreated || project.date || 0).getTime() || 0,
    }));

    let ordered = list.slice();
    if (scope === "recents") {
      ordered.sort((a, b) => b._activity - a._activity);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      ordered = ordered.filter((project) => matchQuery(project, q));
    }

    if (statusFilter) {
      ordered = ordered.filter(
        (project) => String(project.status || "").toLowerCase() === statusFilter
      );
    }

    const byTitle = (a: ProjectLike, b: ProjectLike) =>
      (a.title || "").localeCompare(b.title || "", undefined, {
        sensitivity: "base",
      });
    const byCreatedDesc = (a: ProjectWithMeta, b: ProjectWithMeta) => b._created - a._created;
    const byCreatedAsc = (a: ProjectWithMeta, b: ProjectWithMeta) => a._created - b._created;

    switch (sortOption) {
      case "titleAsc":
        ordered.sort(byTitle);
        break;
      case "titleDesc":
        ordered.sort((a, b) => -byTitle(a, b));
        break;
      case "dateOldest":
        ordered.sort(byCreatedAsc);
        break;
      case "dateNewest":
      default:
        ordered.sort(byCreatedDesc);
        break;
    }

    if (scope === "recents") {
      return ordered.slice(0, recentsLimit);
    }

    return ordered;
  }, [projects, scope, query, statusFilter, sortOption, recentsLimit, matchQuery]);

  const statusTriggerLabel = useMemo(() => {
    const found = statusOptions.find((option) => option.value === statusFilter);
    return found ? found.label : "All statuses";
  }, [statusFilter, statusOptions]);

  const sortTriggerLabel = useMemo(() => {
    const found = sortOptions.find((option) => option.value === sortOption);
    return found ? found.label : sortOptions[0]?.label || "Sort";
  }, [sortOption, sortOptions]);

  return {
    filtersOpen,
    toggleFilters,
    closeFilters,
    filtersRef,
    filtersId,
    scope,
    setScope,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    statusOptions,
    statusTriggerLabel,
    statusDropdown,
    showStatusDropdown: statuses.length > 0,
    sortOption,
    sortOptions,
    sortTriggerLabel,
    sortDropdown,
    filteredProjects,
  };
};












