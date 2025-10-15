import React from "react";
import { Input } from "antd";

import type { NominatimSuggestion } from "../types";
import LocationSuggestions from "./LocationSuggestions";

type LocationSearchInputProps = {
  value: string;
  suggestions: NominatimSuggestion[];
  selectedAddress?: string;
  placeholder?: string;
  autoComplete?: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelect: (suggestion: NominatimSuggestion) => void;
};

const LocationSearchInput: React.FC<LocationSearchInputProps> = ({
  value,
  suggestions,
  selectedAddress,
  placeholder = "Search address",
  autoComplete = "off",
  onChange,
  onSelect,
}) => (
  <div>
    <Input
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
    />
    <LocationSuggestions suggestions={suggestions} onSelect={onSelect} />
    {selectedAddress && (
      <div style={{ marginTop: 4, fontSize: 12, color: "#888" }}>{selectedAddress}</div>
    )}
  </div>
);

export default LocationSearchInput;
