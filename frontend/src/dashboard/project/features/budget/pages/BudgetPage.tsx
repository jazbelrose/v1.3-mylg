import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
} from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import * as ExcelJS from "exceljs";
import styles from "./budget-page.module.css";

import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import ProjectLoadingState from "@/dashboard/project/components/Shared/ProjectLoadingState";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import BudgetHeader from "@/dashboard/project/features/budget/components/HeaderStats";
import BudgetFileModal from "@/dashboard/project/features/budget/components/BudgetFileModal";
import CreateLineItemModal from "@/dashboard/project/features/budget/components/CreateLineItemModal";
import EventEditModal from "@/dashboard/project/features/budget/components/EventEditModal";
import RevisionModal from "@/dashboard/project/features/budget/components/RevisionModal";
// import BudgetChart from "@/dashboard/project/features/budget/components/BudgetChart";
import BudgetToolbar from "@/dashboard/project/features/budget/components/BudgetToolbar";
import BudgetItemsTable from "@/dashboard/project/features/budget/components/BudgetTable";
import BudgetStateManager from "@/dashboard/project/features/budget/components/BudgetStateManager";
import BudgetEventManager from "@/dashboard/project/features/budget/components/BudgetEventManager";
import BudgetTableLogic from "@/dashboard/project/features/budget/components/BudgetTableLogic";
import { BudgetProvider} from "@/dashboard/project/features/budget/context/BudgetProvider";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { useData } from "@/app/contexts/useData";
import type { Project, TimelineEvent } from "@/app/contexts/DataProvider";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import {
  fetchBudgetHeaders,
  updateBudgetItem,
  fetchBudgetItems,
  createBudgetItem,
  deleteBudgetItem,
} from "@/shared/utils/api";
import { v4 as uuid } from "uuid";


const TABLE_BOTTOM_MARGIN = 20;

// Inner component that uses the budget context
const BudgetPageContent = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeProject: initialActiveProject,
    fetchProjectDetails,
    user,
    userId,
    setProjects,
    setSelectedProjects,
    isAdmin: isAdminCtx,
    isBuilder,
    isDesigner,
  } = useData();
  const isAdmin = !!isAdminCtx;
  const canEdit = isAdmin || isBuilder || isDesigner;
  const [activeProject, setActiveProject] = useState(initialActiveProject);
  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef(null);
  const tableRef = useRef(null);
  const [tableHeight, setTableHeight] = useState(0);
  const [saving] = useState(false);
  
  // Budget data from context
  const {
    budgetHeader,
    budgetItems,
    setBudgetHeader,
    setBudgetItems,
    wsOps,
  } = useBudget();
  const { emitBudgetUpdate, emitClientRevisionUpdate } = wsOps;

  // Simplified state for remaining functionality
  const [error, setError] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [areaGroups, setAreaGroups] = useState([]);
  const [invoiceGroups, setInvoiceGroups] = useState([]);
  const [clients, setClients] = useState([]);

  const activeRevisionNumber = useMemo(
    () => Number((budgetHeader as Record<string, unknown> | null)?.revision ?? NaN),
    [budgetHeader]
  );

  const resolvedProject = activeProject ?? initialActiveProject ?? null;
  const isProjectReady = Boolean(projectId && resolvedProject?.projectId === projectId);
  const displayProject = isProjectReady ? resolvedProject : null;

  const coverImage = useMemo(
    () => resolveProjectCoverUrl(displayProject ?? undefined),
    [displayProject]
  );
  const projectPalette = useProjectPalette(coverImage, {
    color: displayProject?.color,
  });

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      if (tableRef.current) {
        const top = tableRef.current.getBoundingClientRect().top;
        setTableHeight(window.innerHeight - top - TABLE_BOTTOM_MARGIN);
      }
    };

    updateTableHeight();
    window.addEventListener("resize", updateTableHeight);

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateTableHeight);
      resizeObserver.observe(document.body);
    }

    return () => {
      window.removeEventListener("resize", updateTableHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    setActiveProject(initialActiveProject);
  }, [initialActiveProject]);

  useEffect(() => {
    if (!projectId) return;
    if (!initialActiveProject || initialActiveProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, initialActiveProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;
    const title = activeProject?.title ?? initialActiveProject?.title;
    if (!title) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes("/budget")) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, "/budget");
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    activeProject?.title,
    initialActiveProject?.title,
    location.pathname,
    navigate,
  ]);

  const handleBack = () => {
    if (!projectId) {
      navigate("/dashboard/projects/allprojects");
      return;
    }

    const title = activeProject?.title ?? initialActiveProject?.title;
    navigate(getProjectDashboardPath(projectId, title));
  };

  const parseStatusToNumber = (statusString) => {
    if (statusString === undefined || statusString === null) {
      return 0;
    }
    const str =
      typeof statusString === "string" ? statusString : String(statusString);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  };

  const handleActiveProjectChange = (updatedProject) => {
    setActiveProject(updatedProject);
  };

  const handleProjectDeleted = (deletedProjectId) => {
    setProjects((prev) => prev.filter((p) => p.projectId !== deletedProjectId));
    setSelectedProjects((prev) => prev.filter((id) => id !== deletedProjectId));
    navigate("/dashboard/projects/allprojects");
  };

  const handleBallparkChange = async (val) => {
    if (!activeProject?.projectId || !budgetHeader) return;
    try {
      const headerId = String((budgetHeader as Record<string, unknown>)?.budgetItemId || "");
      const revision = Number((budgetHeader as Record<string, unknown>)?.revision ?? 1);
      await updateBudgetItem(activeProject.projectId, headerId, {
        headerBallPark: val,
        revision,
      });
      emitBudgetUpdate();
      // Note: setBudgetHeader will be handled by the BudgetDataProvider
    } catch (err) {
      console.error('Error updating ballpark', err);
    }
  };

  const eventsByLineItem = useMemo(() => {
    const map: Record<string, TimelineEvent[]> = {};
    const events = (activeProject as Project)?.timelineEvents;
    if (Array.isArray(events)) {
      events.forEach((ev: TimelineEvent) => {
        const id = String((ev as Record<string, unknown>)?.budgetItemId || "");
        if (!id) return;
        if (!map[id]) map[id] = [];
        map[id].push(ev);
      });
    }
    return map;
  }, [activeProject]);

  const eventDescOptions = useMemo(() => {
    const set = new Set<string>();
    const events = (activeProject as Project)?.timelineEvents;
    if (Array.isArray(events)) {
      events.forEach((ev: TimelineEvent) => {
        const desc = String((ev as Record<string, unknown>)?.description || '').trim().toUpperCase();
        if (desc) set.add(desc);
      });
    }
    return Array.from(set);
  }, [activeProject]);

  const computeGroupsAndClients = useCallback(
    (items, header) => {
      const aSet = new Set();
      const iSet = new Set();
      const cSet = new Set(Array.isArray(header?.clients) ? header.clients : []);
      items.forEach((it) => {
        if (it.areaGroup) aSet.add(String(it.areaGroup).trim().toUpperCase());
        if (it.invoiceGroup)
          iSet.add(String(it.invoiceGroup).trim().toUpperCase());
        if (it.client) cSet.add(it.client);
      });
      setAreaGroups(Array.from(aSet));
      setInvoiceGroups(Array.from(iSet));
      setClients(Array.from(cSet));
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!activeProject?.projectId) return;
    try {
      const revs = await fetchBudgetHeaders(activeProject.projectId);
      setRevisions(revs);

      const header =
        revs.find((h) => Number(h.revision) === activeRevisionNumber) ||
        revs.find((h) => h.revision === h.clientRevisionId) ||
        revs[0] ||
        null;

      if (header?.budgetId) {
        const items = await fetchBudgetItems(header.budgetId, header.revision);
        computeGroupsAndClients(items, header);
      } else {
        setClients([]);
      }
    } catch (err) {
      console.error("Error fetching budget header", err);
    }
  }, [activeProject?.projectId, computeGroupsAndClients, activeRevisionNumber]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleClientRevisionEvent = () => {
      refresh();
    };

    window.addEventListener("clientRevisionUpdated", handleClientRevisionEvent);
    return () => {
      window.removeEventListener("clientRevisionUpdated", handleClientRevisionEvent);
    };
  }, [refresh]);

  const handleNewRevision = async (duplicate = false, fromRevision = null) => {
    if (!activeProject?.projectId || !budgetHeader) return;

    const targetRev = fromRevision != null ? fromRevision : budgetHeader.revision;

    let newRev;
    if (duplicate) {
      const base = Math.floor(targetRev);
      const decimals = revisions
        .filter((r) => Math.floor(r.revision) === base && r.revision !== base)
        .map((r) => parseInt(String(r.revision).split('.')[1] || '0', 10))
        .filter((n) => !Number.isNaN(n));
      const nextDec = decimals.length ? Math.max(...decimals) + 1 : 1;
      newRev = parseFloat(`${base}.${nextDec}`);
    } else {
      const bases = revisions.map((r) => Math.floor(r.revision));
      const nextBase = bases.length ? Math.max(...bases) + 1 : 1;
      newRev = nextBase;
    }

    while (revisions.some((r) => r.revision === newRev)) {
      if (duplicate) {
        const base = Math.floor(targetRev);
        const decimals = revisions
          .filter((r) => Math.floor(r.revision) === base && r.revision !== base)
          .map((r) => parseInt(String(r.revision).split('.')[1] || '0', 10))
          .filter((n) => !Number.isNaN(n));
        const nextDec = decimals.length ? Math.max(...decimals) + 1 : 1;
        newRev = parseFloat(`${base}.${nextDec}`);
      } else {
        newRev += 1;
      }
    }

    try {
      const sourceHeader =
        revisions.find((h) => h.revision === targetRev) || budgetHeader;
      const headerFields = duplicate
        ? {
            ...sourceHeader,
            revision: newRev,
            isHeader: true,
          }
        : {
            title: budgetHeader.title,
            startDate: budgetHeader.startDate,
            endDate: budgetHeader.endDate,
            clients: budgetHeader.clients,
            headerBallPark: 0,
            headerBudgetedTotalCost: 0,
            headerActualTotalCost: 0,
            headerEffectiveMarkup: 0,
            headerFinalTotalCost: 0,
            revision: newRev,
            isHeader: true,
          };
      delete headerFields.budgetItemId;
      delete headerFields.createdAt;
      delete headerFields.updatedAt;

      const newHeader = await createBudgetItem(
        activeProject.projectId,
        budgetHeader.budgetId as string,
        headerFields
      );

      let newItems = [];
      if (duplicate) {
        let items = budgetItems;
        if (sourceHeader.revision !== budgetHeader.revision) {
          items = await fetchBudgetItems(
            sourceHeader.budgetId,
            sourceHeader.revision
          );
        }
        if (items.length > 0) {
          newItems = await Promise.all(
            items.map((it) => {
              const { ...rest } = it;
              return createBudgetItem(
                activeProject.projectId,
                budgetHeader.budgetId as string,
                {
                  ...rest,
                  budgetItemId: `LINE-${uuid()}`,
                  revision: newRev,
                }
              );
            })
          );
        }
      }

      setBudgetHeader(newHeader);
      setBudgetItems(newItems);
      computeGroupsAndClients(newItems, newHeader);
      const revs = await fetchBudgetHeaders(activeProject.projectId);
      setRevisions(revs);
      emitBudgetUpdate();
    } catch (err) {
      console.error('Error creating new revision', err);
    }
  };

  const handleSwitchRevision = async (rev) => {
    if (!activeProject?.projectId) return;
    const header = revisions.find((h) => h.revision === rev);
    if (!header) return;
    try {
      const items = await fetchBudgetItems(header.budgetId, rev);
      setBudgetHeader((prev) => (prev ? { ...prev, ...header } : header));
      setBudgetItems(items);
      computeGroupsAndClients(items, header);
    } catch (err) {
      console.error('Error switching revision', err);
    }
  };

  const handleDeleteRevision = async (rev) => {
    if (!activeProject?.projectId) return;
    const header = revisions.find((h) => h.revision === rev);
    if (!header) return;
    try {
      const items = await fetchBudgetItems(header.budgetId, rev);
      await Promise.all(
        items.map((it) =>
          deleteBudgetItem(activeProject.projectId, it.budgetItemId)
        )
      );
      await deleteBudgetItem(activeProject.projectId, header.budgetItemId);
      const revs = await fetchBudgetHeaders(activeProject.projectId);
      setRevisions(revs);
      if (budgetHeader?.revision === rev) {
        const nextHeader = revs[0] || null;
        if (nextHeader) {
          const nextItems = await fetchBudgetItems(
            nextHeader.budgetId,
            nextHeader.revision
          );
          setBudgetHeader(nextHeader);
          setBudgetItems(nextItems);
          computeGroupsAndClients(nextItems, nextHeader);
        } else {
          setBudgetHeader(null);
          setBudgetItems([]);
          setAreaGroups([]);
          setInvoiceGroups([]);
          setClients([]);
        }
      }
      emitBudgetUpdate();
    } catch (err) {
      console.error('Error deleting revision', err);
    }
  };

  const handleSetClientRevision = async (revisionNumber: number) => {
    if (!activeProject?.projectId) return;

    const targetEntry = revisions.find(
      (h) => Number(h.revision) === Number(revisionNumber) && h.budgetItemId
    );
    if (!targetEntry?.budgetItemId) {
      console.warn("No matching revision header found for client revision update", revisionNumber);
      return;
    }

    const targetRevision = Number(targetEntry.revision ?? null);
    if (!Number.isFinite(targetRevision)) return;

    try {
      const projectId = activeProject.projectId;
      const updates: Promise<unknown>[] = [
        updateBudgetItem(projectId, targetEntry.budgetItemId, {
          clientRevisionId: targetRevision,
          revision: targetEntry.revision,
        }),
      ];

      revisions
        .filter((h) => h.budgetItemId && h.budgetItemId !== targetEntry.budgetItemId)
        .forEach((h) => {
          updates.push(
            updateBudgetItem(projectId, h.budgetItemId!, {
              clientRevisionId: targetRevision,
              revision: h.revision,
            })
          );
        });

      await Promise.all(updates);

      setRevisions((prev) =>
        prev.map((h) => ({ ...h, clientRevisionId: targetRevision }))
      );
      setBudgetHeader((prev) =>
        prev
          ? { ...prev, clientRevisionId: targetRevision }
          : prev
      );

      await refresh();

      emitBudgetUpdate();
      emitClientRevisionUpdate(targetRevision);
    } catch (err) {
      console.error("Failed to set client revision", err);
    }
  };

  const parseFile = async (file) => {
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      
      const worksheet = workbook.worksheets[0];
      const json = [];
      
      // Convert worksheet to JSON starting from row 12 (index 11)
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 12) { // Skip first 11 rows
          const rowData = [];
          row.eachCell((cell, colNumber) => {
            rowData[colNumber - 1] = cell.value || "";
          });
          json.push(rowData);
        }
      });
      
      const [headers, ...rows] = json;
      const idxCategory = headers.findIndex(
        (h) => /element description/i.test(h) || /category/i.test(h)
      );
      const idxAmount = headers.findIndex(
        (h) =>
          /final total/i.test(h) || /amount/i.test(h) || /value|cost/i.test(h)
      );
      if (idxCategory < 0 || idxAmount < 0) {
        throw new Error(
          'Could not find "Element Description" (or "Category") and "Final Total" (or "Amount") columns.'
        );
      }
      rows
        .map((row) => ({
          category: row[idxCategory],
          amount: parseFloat(row[idxAmount]) || 0,
        }))
        .filter((r) => r.category && r.amount > 0);

      setError(null);
    } catch (err) {
      console.error(err);
      setError(
        'Failed to parse Excel file. Ensure it includes headers like "Element Description" and "Final Total" at row 12.'
      );
    }
  };

  if (!isAdmin) {
    return <div>Access Denied</div>;
  }

  const headerNode = isProjectReady
    ? (
        <ProjectHeader
          activeProject={displayProject as Project}
          parseStatusToNumber={parseStatusToNumber}
          userId={userId}
          onProjectDeleted={handleProjectDeleted}
          showWelcomeScreen={handleBack}
          onActiveProjectChange={handleActiveProjectChange}
          onOpenFiles={() => setFilesOpen(true)}
          onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
        />
      )
    : null;

  const layoutProjectId = isProjectReady
    ? displayProject?.projectId
    : projectId ?? displayProject?.projectId ?? undefined;
  const layoutTheme = isProjectReady ? projectPalette : undefined;

  return (
    <>
      <style>{`
        :where(.ant-table-wrapper) .ant-table {
          font-size: 11px !important;
        }
      `}</style>
      <ProjectPageLayout
        projectId={layoutProjectId}
        theme={layoutTheme}
        header={headerNode}
      >
        {isProjectReady ? (
          <>
            {saving && (
              <div style={{ color: '#FA3356', marginBottom: '10px' }}>Saving...</div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -100, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="budget-layout-motion"
              >
                <div className="budget-layout">
                  <QuickLinksComponent ref={quickLinksRef} hideTrigger={true} />
                  <FileManagerComponent
                    isOpen={filesOpen}
                    onRequestClose={() => setFilesOpen(false)}
                    showTrigger={false}
                    folder="uploads"
                  />

                  {/* Use the new component structure */}
                  <BudgetStateManager activeProject={activeProject}>
                    {(stateManager) => (
                      <BudgetEventManager
                        activeProject={activeProject}
                        eventsByLineItem={eventsByLineItem}
                        userId={userId}
                        user={user}
                        stateManager={stateManager}
                      >
                    {(eventHandlers) => (
                      <BudgetTableLogic
                        groupBy={stateManager.groupBy}
                        sortField={stateManager.sortField}
                        sortOrder={stateManager.sortOrder}
                        filterQuery={stateManager.filterQuery as string}
                        selectedRowKeys={stateManager.selectedRowKeys}
                        eventsByLineItem={eventsByLineItem}
                        setSelectedRowKeys={stateManager.setSelectedRowKeys}
                        openEventModal={eventHandlers.openEventModal}
                        openDeleteModal={eventHandlers.openDeleteModal}
                        openDuplicateModal={eventHandlers.openDuplicateModal}
                      >
                        {(tableConfig) => (
                          <>
                            <div className="budget-layout__scroll">
                              <BudgetHeader
                                activeProject={activeProject as Project}
                                budgetHeader={
                                  budgetHeader as {
                                    budgetItemId: string;
                                    revision: number;
                                    [key: string]: unknown;
                                  } | null
                                }
                                budgetItems={budgetItems as { [key: string]: unknown }[]}
                                groupBy={
                                  stateManager.groupBy as
                                    | "none"
                                    | "areaGroup"
                                    | "invoiceGroup"
                                    | "category"
                                }
                                setGroupBy={(g) =>
                                  stateManager.setGroupBy(
                                    g as "none" | "areaGroup" | "invoiceGroup" | "category"
                                  )
                                }
                                onOpenRevisionModal={() =>
                                  stateManager.setRevisionModalOpen(true)
                                }
                                onBallparkChange={handleBallparkChange}
                              />
                              <div style={{ padding: "0" }}>
                                <div>
                                  {error && (
                                    <div style={{ marginTop: "10px", color: "#ff6b6b" }}>
                                      Error: {error}
                                    </div>
                                  )}
                                  {/* BudgetChart removed (component unavailable) */}
                                  <div
                                    style={{
                                      width: "100%",
                                      marginTop: "10px",
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "flex-start",
                                    }}
                                  >
                                    {(() => {
                                      const groupedData =
                                        budgetItems.length > 0
                                          ? (tableConfig.groupedTableData as (Record<string, unknown> & {
                                              budgetItemId: string;
                                              key: string;
                                            })[])
                                          : [];
                                      const availableRowIds = groupedData.map((item) =>
                                        String(item.budgetItemId)
                                      );
                                      const availableRowIdSet = new Set(availableRowIds);
                                      const selectedInScope = stateManager.selectedRowKeys.filter((id) =>
                                        availableRowIdSet.has(id)
                                      );
                                      const isSelectAllChecked =
                                        stateManager.isSelectMode &&
                                        availableRowIds.length > 0 &&
                                        selectedInScope.length === availableRowIds.length;
                                      const handleSelectAllChange = (checked: boolean) => {
                                        if (!stateManager.isSelectMode) return;
                                        stateManager.setSelectedRowKeys((prevKeys) => {
                                          if (checked) {
                                            const next = new Set(prevKeys);
                                            availableRowIds.forEach((id) => next.add(id));
                                            return Array.from(next);
                                          }
                                          return prevKeys.filter((id) => !availableRowIdSet.has(id));
                                        });
                                      };
                                      const handleClearSelection = () => {
                                        stateManager.setSelectedRowKeys((prevKeys) =>
                                          prevKeys.filter((id) => !availableRowIdSet.has(id))
                                        );
                                      };

                                      return (
                                        <>
                                          <BudgetToolbar
                                            selectedRowKeys={stateManager.selectedRowKeys}
                                            handleDuplicateSelected={eventHandlers.handleDuplicateSelected}
                                            openDeleteModal={eventHandlers.openDeleteModal}
                                            openCreateModal={eventHandlers.openCreateModal}
                                            filterQuery={stateManager.filterQuery as string}
                                            onFilterQueryChange={
                                              stateManager.setFilterQuery as (query: string) => void
                                            }
                                            sortField={stateManager.sortField as string | null}
                                            sortOrder={
                                              stateManager.sortOrder as "ascend" | "descend" | null
                                            }
                                            onSortChange={(field, order) => {
                                              stateManager.setSortField(field);
                                              stateManager.setSortOrder(order);
                                            }}
                                            groupBy={
                                              stateManager.groupBy as
                                                | "none"
                                                | "areaGroup"
                                                | "invoiceGroup"
                                                | "category"
                                            }
                                            onGroupChange={(group) => stateManager.setGroupBy(group)}
                                            isSelectAllChecked={isSelectAllChecked}
                                            onSelectAllChange={handleSelectAllChange}
                                            selectionCount={
                                              stateManager.isSelectMode ? selectedInScope.length : 0
                                            }
                                            totalCount={availableRowIds.length}
                                            onClearSelection={handleClearSelection}
                                            isSelectMode={stateManager.isSelectMode}
                                            onToggleSelectMode={(next) =>
                                              stateManager.setIsSelectMode(next)
                                            }
                                            currentPage={stateManager.currentPage}
                                            pageSize={stateManager.pageSize}
                                            onPaginationChange={(page, size) => {
                                              stateManager.setCurrentPage(page);
                                              if (size !== stateManager.pageSize) {
                                                stateManager.setPageSize(size);
                                              }
                                            }}
                                          />
                                          <BudgetItemsTable
                                            dataSource={groupedData}
                                            selectedRowKeys={stateManager.selectedRowKeys}
                                            setSelectedRowKeys={stateManager.setSelectedRowKeys}
                                            lockedLines={stateManager.lockedLines}
                                            openEditModal={eventHandlers.openEditModal}
                                            openDuplicateModal={eventHandlers.openDuplicateModal}
                                            openDeleteModal={eventHandlers.openDeleteModal}
                                            openEventModal={eventHandlers.openEventModal}
                                            eventsByLineItem={eventsByLineItem}
                                            tableRef={tableRef}
                                            tableHeight={tableHeight}
                                            pageSize={stateManager.pageSize}
                                            currentPage={stateManager.currentPage}
                                            setCurrentPage={stateManager.setCurrentPage}
                                            isSelectMode={stateManager.isSelectMode}
                                          />
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <BudgetFileModal
                              isOpen={stateManager.isBudgetModalOpen}
                              onRequestClose={() => stateManager.setBudgetModalOpen(false)}
                              onFileSelected={parseFile}
                            />
                            <RevisionModal
                              isOpen={stateManager.isRevisionModalOpen}
                              onRequestClose={() => stateManager.setRevisionModalOpen(false)}
                              revisions={revisions}
                              activeRevision={Number((budgetHeader as Record<string, unknown>)?.revision ?? 1)}
                              onSwitch={handleSwitchRevision}
                              onDuplicate={(rev) => handleNewRevision(true, rev)}
                              onCreateNew={() => handleNewRevision(false)}
                              onDelete={(rev) => handleDeleteRevision(rev.revision)}
                              onSetClient={(rev) => handleSetClientRevision(rev)}
                              isAdmin={canEdit}
                              activeProject={activeProject}
                            />
                            <CreateLineItemModal
                              isOpen={stateManager.isCreateModalOpen}
                              onRequestClose={eventHandlers.closeCreateModal}
                              onSubmit={(d, isAutoSave) =>
                                stateManager.editItem
                                  ? eventHandlers.handleEditLineItem(d, isAutoSave)
                                  : eventHandlers.handleCreateLineItem(d, isAutoSave)
                              }
                              defaultElementKey={stateManager.nextElementKey}
                              budgetItems={budgetItems}
                              areaGroupOptions={areaGroups}
                              invoiceGroupOptions={invoiceGroups}
                              clientOptions={clients}
                              defaultStartDate={String((budgetHeader as Record<string, unknown>)?.startDate || '')}
                              defaultEndDate={String((budgetHeader as Record<string, unknown>)?.endDate || '')}
                              initialData={stateManager.prefillItem || stateManager.editItem}
                              title={stateManager.editItem ? 'Edit Item' : 'Create Line Item'}
                              revision={Number((budgetHeader as Record<string, unknown>)?.revision ?? 1)}
                            />
                            <EventEditModal
                              isOpen={stateManager.isEventModalOpen}
                              onRequestClose={eventHandlers.closeEventModal}
                              projectId={activeProject?.projectId || ''}
                              budgetItemId={String((stateManager.eventItem as Record<string, unknown>)?.budgetItemId || '')}
                              events={stateManager.eventList}
                              defaultDate={String((budgetHeader as Record<string, unknown>)?.startDate || '')}
                              defaultDescription={String((stateManager.eventItem as Record<string, unknown>)?.description || '')}
                              descOptions={eventDescOptions}
                            />
                            <ConfirmModal
                              isOpen={stateManager.isConfirmingDelete}
                              onRequestClose={() => stateManager.setIsConfirmingDelete(false)}
                              onConfirm={eventHandlers.confirmDelete}
                              message="Delete selected line item(s)?"
                              className={{
                                base: styles.modalContent,
                                afterOpen: styles.modalContentAfterOpen,
                                beforeClose: styles.modalContentBeforeClose,
                              }}
                              overlayClassName={{
                                base: styles.modalOverlay,
                                afterOpen: styles.modalOverlayAfterOpen,
                                beforeClose: styles.modalOverlayBeforeClose,
                              }}
                            />
                          </>
                        )}
                      </BudgetTableLogic>
                    )}
                  </BudgetEventManager>
                )}
              </BudgetStateManager>
            </div>
          </motion.div>
        </AnimatePresence>
      ) : (
        <ProjectLoadingState />
      )}
      </ProjectPageLayout>
    </>
  );
};

// Main component that provides the budget context
const BudgetPage = () => {
  const { activeProject } = useData();
  
  return (
    <BudgetProvider projectId={activeProject?.projectId}>
      <BudgetPageContent />
    </BudgetProvider>
  );
};

export default BudgetPage;












