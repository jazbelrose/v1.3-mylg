// NewProject.tsx
import React, { useState, useEffect } from "react";
import { uploadData } from "aws-amplify/storage";
import { Helmet, HelmetProvider } from "react-helmet-async";
import ProjectName from "@/dashboard/NewProject/components/NewProjectName";
import NewProjectBudget from "@/dashboard/NewProject/components/NewProjectBudget";
import NewProjectFinishline from "@/dashboard/NewProject/components/NewProjectFinishLine";
import NewProjectUploadFiles from "@/dashboard/NewProject/components/NewProjectUploadFiles";
import NewProjectAddress from "@/dashboard/NewProject/components/NewProjectAddress";
import NewProjectDescription from "@/dashboard/NewProject/components/NewProjectDescription";
import { useData } from "@/app/contexts/useData";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import { parseBudget } from "@/shared/utils/budgetUtils";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import {
  POST_PROJECTS_URL,
  POST_PROJECT_TO_USER_URL,
  S3_PUBLIC_BASE,
  apiFetch,
} from "@/shared/utils/api";
import styles from "../../../NewProject/styles/new-project.module.css";

// ─────────────────────────────────────────────────────────
// Minimal types 
// ─────────────────────────────────────────────────────────
type LatLng = { lat: number; lng: number };

type UploadedFile = { fileName: string; url: string };

type NewProjectItem = {
  title: string;
  date: string;
  dateCreated: string;
  milestone: string; // "10" etc.
  finishline: string; // YYYY-MM-DD
  description: string;
  location: LatLng;
  address: string;
  budget: { date: string; total: number };
  contact: { contact: string; name: string; phone: string };
  galleries: unknown[];
  invoiceDate: string;
  invoices: unknown[];
  slug: string;
  status: string;
  tags: string[];
  team: Array<{ userId: string }>;
  revisionHistory: unknown[];
  thumbnails: string[];
  downloads: string[];
  color: string;
  uploads: UploadedFile[];
};

type PutProjectPayload = {
  TableName: "Projects";
  Item: NewProjectItem;
};

type CreateProjectResponse = { projectId: string };

type UseDataSlice = {
  userName?: string;
  userId?: string;
  setActiveProject: (p: NewProjectItem & { projectId: string }) => void;
  setProjects: React.Dispatch<React.SetStateAction<unknown[]>>;
  setUserProjects: React.Dispatch<React.SetStateAction<unknown[]>>;
};

const NewProject: React.FC = () => {
  const [projectName, setProjectName] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [finishline, setFinishLine] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [descriptionPlainText, setDescriptionPlainText] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileNames, setSelectedFileNames] = useState<string>("");

  const [location, setLocation] = useState<LatLng>({
    lat: 34.0522,
    lng: -118.2437,
  });
  const [address, setAddress] = useState<string>("Los Angeles, CA");

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const { userId, setActiveProject, setProjects, setUserProjects, setUser } =
    useData() as UseDataSlice & { setUser: React.Dispatch<React.SetStateAction<(Record<string, unknown> & { projects?: string[] }) | null>> };
  const navigate = useNavigate();

  const [validationMessage, setValidationMessage] = useState<string>("");

  // Collect the payload for initial creation
  const collectFormData = (): PutProjectPayload => {
    const currentDate = new Date();
    const formattedDate = `${currentDate.getFullYear()}-${String(
      currentDate.getMonth() + 1
    ).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;

    // default admin team members (replace with your policy)
    const defaultAdmins = [
      { userId: "7e1581a0-2dda-4ad9-a2aa-17dd7f81d3b2" },
      { userId: "abe70c08-6743-44b5-99a9-f9638f606b1a" },
    ];

    const team = [
      ...defaultAdmins,
      ...(userId && !defaultAdmins.find((a) => a.userId === userId)
        ? [{ userId }]
        : []),
    ];

    return {
      TableName: "Projects",
      Item: {
        title: projectName,
        date: formattedDate,
        dateCreated: formattedDate,
        milestone: "10",
        finishline: finishline || formattedDate,
        description,
        location,
        address,
        budget: {
          date: formattedDate,
          total: parseBudget(budget),
        },
        contact: {
          contact: "N/A",
          name: "N/A",
          phone: "N/A",
        },
        galleries: [],
        invoiceDate: formattedDate,
        invoices: [],
        slug: "project-slug", // you might prefer slugify(projectName)
        status: "10%",
        tags: [],
        team,
        revisionHistory: [],
        thumbnails: [],
        downloads: [],
        color: "#FA3356",
        uploads: [],
      },
    };
  };

  // Upload files to S3 (Amplify Storage)
  const handleFileUpload = async (projectId: string): Promise<UploadedFile[]> => {
    const uploadedFileUrls: UploadedFile[] = [];
    try {
      let completed = 0;
      const totalFiles = selectedFiles.length;

      const uploadPromises = selectedFiles.map(async (file) => {
        const filename = `projects/${projectId}/uploads/${file.name}`;
        // amplify v6 uploadData signature
        await uploadData({
          key: filename,
          data: file,
          options: { accessLevel: "public" },
        });

        const fileUrl = `${S3_PUBLIC_BASE}${filename}`;
        uploadedFileUrls.push({ fileName: file.name, url: fileUrl });

        completed += 1;
        setUploadProgress(Math.round((completed / Math.max(1, totalFiles)) * 100));
      });

      await Promise.all(uploadPromises);
    } catch (error) {
      console.error("Error uploading files:", error);
    }
    return uploadedFileUrls;
  };

  // Basic validation
  const validateForm = (): boolean => {
    return !!(
      projectName &&
      budget &&
      finishline &&
      descriptionPlainText.trim().length > 0 &&
      address
    );
  };

  /**
   * Final submit handler for creating a new project.
   * - Collects project data.
   * - Sends the data to the backend to create the project.
   * - Updates the user's profile and uploads files.
   * - (Optional) Sends a notification email.
   */
  const handleFinalSubmit = async () => {
    if (!validateForm()) {
      setValidationMessage("Please fill all fields");
      setTimeout(() => setValidationMessage(""), 2000);
      return;
    }
    setValidationMessage("");
    if (isSubmitting) return;

    setIsSubmitting(true);
    const initialProjectData = collectFormData();

    try {
      // Create project
      const data = await apiFetch<CreateProjectResponse>(POST_PROJECTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialProjectData),
      });
      const realProjectId = data.projectId;

      // Update user profile
      await apiFetch<{ success?: boolean }>(
        `${POST_PROJECT_TO_USER_URL}?TableName=userProfiles&userId=${userId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newProjectId: realProjectId }),
        }
      );
      // Since apiFetch throws on error, success means we got here
      console.log("User profile updated with new project.");

      // Upload files (if any)
      const uploadedFileUrls = await handleFileUpload(realProjectId);

      // Update project with uploads
      const updateData = { uploads: uploadedFileUrls };
      await apiFetch<{ success?: boolean }>(
        `${POST_PROJECTS_URL}?TableName=Projects&projectId=${realProjectId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        }
      );
      // Since apiFetch throws on error, success means we got here

      const newProject: NewProjectItem & { projectId: string } = {
        ...initialProjectData.Item,
        projectId: realProjectId,
        uploads: uploadedFileUrls,
      };

      // Optional email notification
      // await handleNotification({
      //   projectId: realProjectId,
      //   projectName,
      //   budget,
      //   finishline,
      //   description,
      //   location,
      //   address,
      //   userName,
      // });

      console.log("Success!");
      setSubmissionSuccess(true);
      handleNewProjectCreated(newProject);
    } catch (error) {
      console.error("There was an error with the submission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewProjectCreated = (newProject: NewProjectItem & { projectId: string }) => {
    // Add the new project to local lists
    setProjects((prev) => (Array.isArray(prev) ? [...prev, newProject] : [newProject]));
    setUserProjects((prev) => (Array.isArray(prev) ? [...prev, newProject] : [newProject]));

    // Update the authenticated user's profile locally with the new project ID
    setUser((prev) => {
      if (!prev) return prev;
      const prevProjects = Array.isArray(prev.projects) ? prev.projects : [];
      return { ...prev, projects: [...prevProjects, newProject.projectId] };
    });

    // Set active & navigate
    setActiveProject(newProject);
    navigate(getProjectDashboardPath(newProject.projectId, newProject.title));
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <HelmetProvider>
      <Helmet>
        <title>Start something | *MYLG!*</title>
        <meta
          name="description"
          content="Create a new project with *MYLG!* - Set budget, timeline, and upload files to get started."
        />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className={styles.newProjectPage}>
        <div className={styles.newProjectWrapper}>
          {/* Header Section */}
          <header className={styles.newProjectHeader}>
            <button
              className={styles.backButton}
              onClick={() => navigate("/dashboard/projects")}
              aria-label="Back to dashboard"
            >
              <FaArrowLeft />
            </button>
            <h1 className={styles.newProjectTitle}>Start something</h1>
            <p className={styles.newProjectSubtitle}>
              Set up your project details, budget, and timeline to get started
            </p>
          </header>

          {/* Main Form Card */}
          <div className={styles.newProjectCard}>
            <div className={styles.formGrid}>
              {/* Project Name - Full Width, Reduced Height */}
              <div className={styles.projectNameSection}>
                <ProjectName projectName={projectName} setProjectName={setProjectName} />
              </div>

              {/* Left Bento: Location & Description Vertically Stacked */}
              <div className={`${styles.formSection} ${styles.locationDescriptionFormSection}`}>
                <h2 className={styles.sectionTitle}>Location & Details</h2>
                <div className={styles.locationDescriptionSection}>
                  <div className={styles.locationContainer}>
                    <NewProjectAddress
                      location={location}
                      setLocation={setLocation}
                      address={address}
                      setAddress={setAddress}
                    />
                  </div>
                  <div className={styles.descriptionContainer}>
                    <NewProjectDescription
                      description={description}
                      setDescription={(value, plainText) => {
                        setDescription(value);
                        setDescriptionPlainText(plainText);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Bento: Budget & Finish Line Vertically Stacked */}
              <div className={`${styles.formSection} ${styles.budgetFinishFormSection}`}>
                <h2 className={styles.sectionTitle}>Budget & Timeline</h2>
                <div className={styles.budgetFinishSection}>
                  <div className={styles.budgetContainer}>
                    <NewProjectBudget
                      budget={budget}
                      setBudget={setBudget}
                    />
                  </div>
                  <div className={styles.finishContainer}>
                    <NewProjectFinishline finishline={finishline} setFinishLine={setFinishLine} />
                  </div>
                </div>
              </div>

              {/* 3rd Row: File Upload */}
              <div className={`${styles.uploadSection} ${styles.uploadFormSection}`}>
                <h2 className={styles.sectionTitle}>Project Files</h2>
                <NewProjectUploadFiles
                  selectedFiles={selectedFiles}
                  setSelectedFiles={setSelectedFiles}
                  selectedFileNames={selectedFileNames}
                  setSelectedFileNames={setSelectedFileNames}
                />
              </div>

              {/* 4th Row: Submit Button on the Bottom */}
              <div className={`${styles.submitSection} ${styles.submitFormSection}`}>
                {!submissionSuccess ? (
                  <>
                    <button
                      type="submit"
                      className={styles.submitButton}
                      onClick={handleFinalSubmit}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <div className={styles.submitSpinner}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 50 50"
                            className={styles.submitSpinnerSvg}
                          >
                            <circle
                              className={styles.submitSpinnerPath}
                              cx="25"
                              cy="25"
                              r="20"
                              fill="none"
                            />
                          </svg>
                          Starting...
                        </div>
                      ) : (
                        "Start something"
                      )}
                    </button>

                    {validationMessage && (
                      <div className={styles.validationMessage}>
                        {validationMessage}
                      </div>
                    )}

                    {isSubmitting && selectedFiles.length > 0 && (
                      <div className={styles.uploadProgress}>
                        <div className={styles.uploadProgressBar}>
                          <div
                            className={styles.uploadProgressCompleted}
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <div className={styles.uploadProgressText}>
                          Uploading files... {uploadProgress}%
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.successAnimation}>
                    <svg className={styles.checkmark} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                      <circle className={styles.checkmarkCircle} cx="26" cy="26" r="25" fill="none" />
                      <path
                        className={styles.checkmarkCheck}
                        fill="none"
                        d="M14.1 27.2l7.1 7.2 16.7-16.8"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </HelmetProvider>
  );
};

export default NewProject;











