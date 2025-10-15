import React from "react";

import type { NominatimSuggestion } from "../types";

type LocationSuggestionsProps = {
  suggestions: NominatimSuggestion[];
  onSelect: (suggestion: NominatimSuggestion) => void;
};

const baseContainerStyle: React.CSSProperties = {
  position: "absolute",
  zIndex: 10,
  background: "#222",
  border: "1px solid #444",
  borderRadius: 4,
  width: "100%",
};

const suggestionStyle: React.CSSProperties = {
  padding: "6px 10px",
  cursor: "pointer",
  background: "inherit",
};

const highlightStyle: React.CSSProperties = {
  fontWeight: "bold",
  color: "#fff",
};

const LocationSuggestions: React.FC<LocationSuggestionsProps> = ({ suggestions, onSelect }) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="suggestions-list" style={baseContainerStyle}>
      {suggestions.map((suggestion, index) => (
        <div
          key={suggestion.place_id}
          onClick={() => onSelect(suggestion)}
          style={{
            ...suggestionStyle,
            borderBottom: index < suggestions.length - 1 ? "1px solid #333" : "none",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = "#eee";
            (event.currentTarget.firstChild as HTMLElement).style.color = "#222";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = "inherit";
            (event.currentTarget.firstChild as HTMLElement).style.color = "#fff";
          }}
        >
          <span style={highlightStyle}>{suggestion.display_name}</span>
        </div>
      ))}
    </div>
  );
};

export default LocationSuggestions;
