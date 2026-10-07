import { useEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import "./styles/ArchiveFilters.css";

export function ArchiveSortControl({ value, onChange, count, unit = "장", adminTotal }) {
  const options = [
    { value: "최신순", label: "최신순" },
    { value: "오래된순", label: "오래된 순" },
    { value: "인기순", label: "인기순" },
  ];

  return (
    <div className="photo-sort-row">
      <div className="photo-sort-options" role="group" aria-label="정렬 방식">
        {options.map((option, index) => (
          <span className="photo-sort-option" key={option.value}>
            {index > 0 && <span className="photo-sort-divider" aria-hidden="true" />}
            <button
              type="button"
              className={value === option.value ? "active" : ""}
              aria-pressed={value === option.value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          </span>
        ))}
      </div>
      <span className="photo-sort-count" aria-label={unit === "장" ? "사진 개수" : "동영상 개수"}>
        총 {Number(count).toLocaleString("ko-KR")}{unit}
        {adminTotal !== undefined && <span className="photo-sort-admin-total"> / 전체 {Number(adminTotal).toLocaleString("ko-KR")}{unit}</span>}
      </span>
    </div>
  );
}

const HAIR_COLORS = {
  흑발: "#111111", 갈발: "#89694b", 금발: "#e9d99e", 베이지: "#d3b36e",
  주머: "#d88c00", 핑머: "#ff8bb4", 적발: "#940b13", 빨머: "#940b13",
  와인: "#70244f", 은발: "#d9d9d9",
};

function HairColorChip({ color, enabled }) {
  if (!enabled || !HAIR_COLORS[color]) return null;
  return <span className="hair-color-chip" style={{ backgroundColor: HAIR_COLORS[color] }} aria-hidden="true" />;
}

function DateRangeFields({ startDate, setStartDate, endDate, setEndDate }) {
  return (
    <div className="filter-panel-dates">
      <label><span>시작일</span><input type="date" value={startDate} max={endDate || undefined} onInput={(event) => setStartDate(event.currentTarget.value)} aria-label="시작일" /></label>
      <span aria-hidden="true">–</span>
      <label><span>종료일</span><input type="date" value={endDate} min={startDate || undefined} onInput={(event) => setEndDate(event.currentTarget.value)} aria-label="종료일" /></label>
    </div>
  );
}

function ArchiveFilters({
  search,
  setSearch,
  searchPlaceholder,
  type,
  setType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  typeLabel = "유형",
  showType = true,
  showAdminPhotoTypes = false,
  secondaryValue = "전체",
  setSecondaryValue,
  secondaryLabel = "",
  secondaryOptions = [],
  tertiaryValue = "전체",
  setTertiaryValue,
  tertiaryLabel = "",
  tertiaryOptions = [],
  extraSelection,
  extraDisabled = false,
  extraHelp = "",
  extraIsPublicationSetting = false,
  includeDm = false,
  setExtraSelection,
  allActive = false,
  onAllClick,
}) {

  const [openFilter, setOpenFilter] = useState(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const filterPanelRef = useRef(null);
  const barRef = useRef(null);
  const allExtrasRef = useRef(null);
  const extraOptions = [["members", "멤버"], ["food", "음식"], ["scenery", "풍경"], ["dogs", "짱대박"], ["other", "그 외"], ...(includeDm ? [["dm", "DM"]] : [])];
  const allExtrasChecked = extraOptions.every(([key]) => extraSelection?.[key]);
  const someExtrasChecked = extraOptions.some(([key]) => extraSelection?.[key]);
  useEffect(() => {
    if (allExtrasRef.current) allExtrasRef.current.indeterminate = someExtrasChecked && !allExtrasChecked;
  }, [someExtrasChecked, allExtrasChecked, filterPanelOpen]);
  const typeOptions = ["전체", "선택 안됨", "셀카", "남찍사", "거울셀카", ...(showAdminPhotoTypes ? ["리우뷰", "스크린샷", "같은사진"] : [])];
  const hasActiveFilters = type !== "전체"
    || secondaryValue !== "전체"
    || tertiaryValue !== "전체"
    || Boolean(startDate)
    || Boolean(endDate)
    || someExtrasChecked;

  useEffect(() => {
    function closePanel(event) {
      if (!filterPanelRef.current?.contains(event.target)) setFilterPanelOpen(false);
      if (!barRef.current?.contains(event.target) || !event.target.closest(".filter-dropdown")) setOpenFilter(null);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") { setFilterPanelOpen(false); setOpenFilter(null); }
    }
    document.addEventListener("pointerdown", closePanel);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePanel);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function resetFilters() {
    setType?.("전체");
    setSecondaryValue?.("전체");
    setTertiaryValue?.("전체");
    setStartDate("");
    setEndDate("");
    if (!extraIsPublicationSetting) setExtraSelection?.({ members: false, food: false, scenery: false, dogs: false, other: false, dm: false });
    onAllClick?.();
  }

  return (
    <div className="filter-bar" ref={barRef}>
      <div className="filter-panel-wrap" ref={filterPanelRef}>
        <button
          type="button"
          className={`filter-slider-button ${hasActiveFilters ? "has-active-filter" : ""}`}
          aria-label="사진 필터 열기"
          aria-expanded={filterPanelOpen}
          onClick={() => { setFilterPanelOpen((open) => !open); setOpenFilter(null); }}
        >
          <SlidersHorizontal size={16} strokeWidth={1.7} />
        </button>

        {filterPanelOpen && (
          <div className="filter-panel-popup" role="dialog" aria-label="사진 필터">
            <div className="filter-panel-header">
              <strong>필터</strong>
              <button type="button" aria-label="필터 닫기" onClick={() => setFilterPanelOpen(false)}>
                <X size={16} strokeWidth={1.7} />
              </button>
            </div>

            {showType && <div className="filter-panel-section">
              <span>{typeLabel}</span>
              <div className="filter-panel-options">
                {typeOptions.map((option) => (
                  <button type="button" key={option} className={type === option ? "active" : ""} onClick={() => setType(option)}>{option}</button>
                ))}
              </div>
            </div>}

            {setSecondaryValue && secondaryOptions.length > 0 && (
              <div className="filter-panel-section">
                <span>{secondaryLabel}</span>
                <div className="filter-panel-options hair-color-options">
                  {["전체", ...secondaryOptions].map((option) => (
                    <button type="button" key={option} className={secondaryValue === option ? "active" : ""} aria-pressed={secondaryValue === option} onClick={() => setSecondaryValue(option)}><HairColorChip color={option} enabled={secondaryLabel === "머리색"} />{option}</button>
                  ))}
                </div>
              </div>
            )}

            {setTertiaryValue && tertiaryOptions.length > 0 && (
              <div className="filter-panel-section">
                <span>{tertiaryLabel}</span>
                <div className="filter-panel-options">
                  {["전체", ...tertiaryOptions].map((option) => (
                    <button type="button" key={option} className={tertiaryValue === option ? "active" : ""} onClick={() => setTertiaryValue(option)}>{option}</button>
                  ))}
                </div>
              </div>
            )}

            {setExtraSelection && (
              <div className="filter-panel-section filter-extra-section">
                <span>추가 선택</span>
                {extraHelp && <small>{extraHelp}</small>}
                <label className="filter-checkbox-label">
                  <input ref={allExtrasRef} type="checkbox" disabled={extraDisabled} checked={allExtrasChecked} onChange={(event) => setExtraSelection(Object.fromEntries(extraOptions.map(([key]) => [key, event.target.checked])))} />
                  전체 선택
                </label>
                <div className="filter-extra-options">
                  {extraOptions.map(([key, label]) => (
                    <label className="filter-checkbox-label" key={key}>
                      <input type="checkbox" disabled={extraDisabled} checked={Boolean(extraSelection?.[key])} onChange={(event) => setExtraSelection((current) => ({ ...current, [key]: event.target.checked }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="filter-panel-section">
              <span>검색 기간</span>
              <DateRangeFields startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} />
            </div>

            <div className="filter-panel-actions">
              <button type="button" onClick={resetFilters}>초기화</button>
              <button type="button" onClick={() => setFilterPanelOpen(false)}>확인</button>
            </div>
          </div>
        )}
      </div>

      {/* 전체 */}
      <button
        type="button"
        className={`filter-button all-tab ${allActive ? "active" : ""}`}
        onClick={onAllClick}
      >
        전체
      </button>

      {/* 사진 유형 */}
      {showType && <div className="filter-dropdown">
        <button
          type="button"
          className="filter-button"
          onClick={() => setOpenFilter(openFilter === "type" ? null : "type")}
        >
          <span>{type === "전체" ? typeLabel : type}</span>
          <ChevronDown size={12} strokeWidth={1.5} />
        </button>

        {openFilter === "type" && (
          <div className="filter-dropdown-menu">
            {typeOptions.map((option) => (
              <button
                type="button"
                key={option}
                className={type === option ? "active" : ""}
                onClick={() => {
                  setType(option);
                  setOpenFilter(null);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>}

      {/* 머리색 */}
      {setSecondaryValue && secondaryOptions.length > 0 && (
        <div className="filter-dropdown">
          <button
            type="button"
            className="filter-button"
            onClick={() =>
              setOpenFilter(openFilter === "secondary" ? null : "secondary")
            }
          >
            <HairColorChip color={secondaryValue} enabled={secondaryLabel === "머리색"} />
            <span>
              {secondaryValue === "전체" ? secondaryLabel : secondaryValue}
            </span>

            <ChevronDown size={12} strokeWidth={1.5} />
          </button>

          {openFilter === "secondary" && (
            <div className="filter-dropdown-menu">
              {["전체", ...secondaryOptions].map((option) => (
                <button
                  type="button"
                  key={option}
                  className={secondaryValue === option ? "active" : ""}
                  onClick={() => {
                    setSecondaryValue(option);
                    setOpenFilter(null);
                  }}
                >
                  <HairColorChip color={option} enabled={secondaryLabel === "머리색"} />
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="filter-dropdown filter-date-dropdown">
        <button type="button" className={`filter-button ${startDate || endDate ? "has-active-filter" : ""}`} aria-expanded={openFilter === "dates"} aria-controls="archive-date-dropdown" onClick={() => { setOpenFilter(openFilter === "dates" ? null : "dates"); setFilterPanelOpen(false); }}>
          <span>검색 기간</span>
          <ChevronDown size={12} strokeWidth={1.5} />
        </button>
        {openFilter === "dates" && (
          <div className="filter-dropdown-menu filter-date-menu" id="archive-date-dropdown" role="dialog" aria-label="검색 기간 설정">
            <DateRangeFields startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} />
            <div className="filter-panel-actions">
              <button type="button" onClick={() => { setStartDate(""); setEndDate(""); }}>기간 초기화</button>
              <button type="button" onClick={() => setOpenFilter(null)}>확인</button>
            </div>
          </div>
        )}
      </div>

      {/* 검색 */}
      <div className="search-box">
        <span>⌕</span>

        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    </div>
  );
}

export default ArchiveFilters;
