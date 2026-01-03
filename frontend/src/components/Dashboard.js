import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const Dashboard = ({ isDark = false, toggleTheme }) => {
  const [metrics, setMetrics] = useState({ avg_churn: 0, total_customers: 0 });
  const [predictions, setPredictions] = useState([]);
  const [user, setUser] = useState({ username: "Loading...", role: "Unknown" });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const token = localStorage.getItem("token");
  const config = useMemo(
    () => ({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    [token]
  );

  // Fetch user
  useEffect(() => {
    if (!token) return;
    axios
      .get("http://localhost:3000/me", config)
      .then((res) => setUser(res.data))
      .catch(() => setUser({ username: "Guest", role: "Unknown" }));
  }, [config, token]);

  const fetchMetrics = useCallback(async () => {
    if (!token) return setPageLoaded(true);
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:3000/dashboard", config);
      setMetrics(res.data || { avg_churn: 0, total_customers: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setPageLoaded(true);
    }
  }, [config, token]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const handleUpload = async () => {
    if (!file) return alert("Select file");
    setLoading(true);
    setTrainingStatus("queued");

    const formData = new FormData();
    formData.append("file", file);

    try {
      await axios.post("http://localhost:3000/upload", formData, {
        ...config,
        headers: { ...config.headers, "Content-Type": "multipart/form-data" },
      });
      startTrainingPoll();
    } catch (err) {
      alert("Upload failed");
      setTrainingStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const startTrainingPoll = () => {
    setTrainingStatus("in_progress");
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(
          "http://localhost:3000/training-status",
          config
        );
        if (res.data.status === "complete") {
          setTrainingStatus("complete");
          clearInterval(interval);
          fetchMetrics();
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 5000);
  };

  const handlePredict = async () => {
    setLoading(true);
    try {
      const res = await axios.post("http://localhost:3000/predict", {}, config);
      setPredictions(res.data.results || []);
      fetchMetrics();
    } catch (err) {
      alert("Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async () => {
    if (!window.confirm("Delete all data?")) return;
    setLoading(true);
    try {
      await axios.post("http://localhost:3000/clear-data", {}, config);
      setPredictions([]);
      fetchMetrics();
    } catch (err) {
      alert("Clear failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await axios.get("http://localhost:3000/report", {
        ...config,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "churn_report.pdf");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Download failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  const filteredPredictions = predictions.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(p.id).includes(searchTerm)
  );

  const churnChartData = {
    labels: ["Average Churn"],
    datasets: [
      {
        label: "Churn",
        data: [metrics.avg_churn],
        backgroundColor: isDark ? "#FF6384" : "#36A2EB",
      },
    ],
  };

  const featurePieData = {
    labels: ["Tenure", "Usage", "Complaints"],
    datasets: [
      {
        data: [0.4, 0.35, 0.25],
        backgroundColor: ["#FF6384", "#36A2EB", "#FFCE56"],
      },
    ],
  };

  if (!pageLoaded) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  return (
    <div data-bs-theme={isDark ? "dark" : "light"}>
      {/* Navbar – keep your current one with avatar dropdown */}

      <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm">
        <div className="container-fluid">
          <button
            className="navbar-brand btn btn-link text-decoration-none p-0 border-0 bg-transparent text-white fs-4 fw-bold"
            onClick={() => window.scrollTo(0, 0)}
          >
            Churn Predictor
          </button>

          <div className="ms-auto d-flex align-items-center gap-3">
            <button
              className="btn btn-outline-light btn-sm"
              onClick={fetchMetrics}
              disabled={loading}
              title="Refresh dashboard"
            >
              <i className="bi bi-arrow-repeat"></i>
            </button>

            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="darkModeSwitch"
                checked={isDark}
                onChange={toggleTheme}
              />
              <label
                className="form-check-label text-white small"
                htmlFor="darkModeSwitch"
              >
                Dark
              </label>
            </div>

            <div className="dropdown">
              <button
                className="btn btn-link p-0 border-0 shadow-none dropdown-toggle d-flex align-items-center gap-2 text-decoration-none"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <div className="position-relative">
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
                    style={{
                      width: "44px",
                      height: "44px",
                      fontSize: "1.2rem",
                      background: user.role === "admin" ? "#198754" : "#0d6efd",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {user.username.charAt(0).toUpperCase() || "?"}
                  </div>
                  {user.role === "admin" && (
                    <span
                      className="position-absolute bottom-0 end-0 badge rounded-pill bg-danger border border-light p-1"
                      style={{ fontSize: "0.6rem", minWidth: "16px" }}
                    >
                      A
                    </span>
                  )}
                </div>
                <div className="d-none d-md-block text-start text-white small">
                  <div className="fw-medium">{user.username}</div>
                  <div
                    className="text-white-50"
                    style={{ fontSize: "0.75rem" }}
                  >
                    {user.role
                      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
                      : "Guest"}
                  </div>
                </div>
              </button>

              <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 mt-2">
                <li className="dropdown-item text-center py-3">
                  <div className="fw-bold fs-5">{user.username}</div>
                  <div className="badge bg-opacity-25 bg-light text-dark mt-1">
                    {user.role
                      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
                      : "Unknown"}
                  </div>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button
                    className="dropdown-item text-danger fw-medium d-flex align-items-center"
                    onClick={handleLogout}
                  >
                    <i className="bi bi-box-arrow-right me-2 fs-5"></i>
                    Logout
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mt-4">
        {loading && (
          <div className="text-center my-5">
            <div className="spinner-border text-primary" />
            <p>Processing...</p>
          </div>
        )}

        {trainingStatus && (
          <div
            className={`alert alert-${
              trainingStatus === "complete" ? "success" : "info"
            } mb-4`}
          >
            {trainingStatus === "queued" && "Training queued..."}
            {trainingStatus === "in_progress" && "Training in progress..."}
            {trainingStatus === "complete" &&
              "Training complete – model updated!"}
          </div>
        )}

        <div className="row g-4">
          {/* Upload card */}
          <div className="col-md-6">
            <div className="card shadow h-100">
              <div className="card-header bg-primary text-white">
                <h5>Upload Data</h5>
              </div>
              <div className="card-body">
                <input
                  type="file"
                  className="form-control mb-3"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={loading}
                />
                <button
                  className="btn btn-primary w-100"
                  onClick={handleUpload}
                  disabled={loading || !file}
                >
                  Upload & Train
                </button>
              </div>
            </div>
          </div>

          {/* Actions card */}
          <div className="col-md-6">
            <div className="card shadow h-100">
              <div className="card-header bg-success text-white">
                <h5>Actions</h5>
              </div>
              <div className="card-body d-flex flex-column gap-3">
                <button
                  className="btn btn-success"
                  onClick={handlePredict}
                  disabled={loading}
                >
                  Run Predictions
                </button>
                <button
                  className="btn btn-outline-secondary"
                  onClick={handleDownloadReport}
                  disabled={loading}
                >
                  Download Report
                </button>
                <button
                  className="btn btn-danger mt-2"
                  onClick={handleClearData}
                  disabled={loading}
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="col-md-6">
            <div className="card shadow">
              <div className="card-header bg-info text-white">
                <h5>Average Churn Rate</h5>
              </div>
              <div className="card-body" style={{ height: "400px" }}>
                <Bar
                  data={churnChartData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              </div>
            </div>
          </div>

          <div className="col-md-6">
            <div className="card shadow">
              <div className="card-header bg-warning text-dark">
                <h5>Feature Importance</h5>
              </div>
              <div className="card-body" style={{ height: "400px" }}>
                <Pie
                  data={featurePieData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              </div>
            </div>
          </div>

          {/* Predictions */}
          {predictions.length > 0 && (
            <div className="col-12">
              <div className="card shadow">
                <div className="card-header bg-secondary text-white">
                  <h5>Predictions</h5>
                </div>
                <div className="card-body">
                  <input
                    type="text"
                    className="form-control mb-3"
                    placeholder="Search by name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div className="table-responsive">
                    <table className="table table-striped">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Churn %</th>
                          <th>Recommendation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPredictions.map((p) => (
                          <tr key={p.id}>
                            <td>{p.id}</td>
                            <td>{p.name || `Customer ${p.id}`}</td>
                            <td>{(p.prob * 100).toFixed(1)}%</td>
                            <td>{p.rec}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
