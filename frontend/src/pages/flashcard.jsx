// import React, { useState, useEffect } from "react";
// import axios from "axios";
// import { Search } from "lucide-react";
// import styled from "@emotion/styled";
//
// const FlashcardDiv = styled.div`
//   width: 100%;
//   height: 11rem;
//   background-color: white;
//   border: 1px solid #e5e7eb;
//   border-radius: 0.5rem;
//   box-shadow: 0 1px 2px rgba(0,0,0,0.05);
//   transition: all 0.2s;
//
//   &:hover {
//     box-shadow: 0 4px 6px rgba(0,0,0,0.1);
//     transform: translateY(-0.25rem);
//   }
// `;
//
// const PageContainer = styled.div`
//   display: flex;
//   height: 100vh;
//   background-color: #f8f6f7;
// `;
//
// const MainContent = styled.main`
//   flex: 1;
//   overflow: auto;
//   padding: 2rem;
// `;
//
// const HeaderDiv = styled.div`
//   margin-bottom: 1.5rem;
// `;
//
// const PageTitle = styled.h1`
//   font-size: 1.5rem;
//   font-weight: bold;
//   color: #111827;
// `;
//
// const PageSubtitle = styled.p`
//   font-size: 0.875rem;
//   color: #6b7280;
//   margin-bottom: 1rem;
// `;
//
// const TopBar = styled.div`
//   display: flex;
//   align-items: center;
//   gap: 10px;
// `;
//
// const SearchContainer = styled.div`
//   position: relative;
//   flex: 1;
//   max-width: 42rem;
// `;
//
// const SearchIconWrapper = styled.div`
//   position: absolute;
//   left: 0.75rem;
//   top: 50%;
//   transform: translateY(-50%);
//   color: #9ca3af;
// `;
//
// const SearchInput = styled.input`
//   width: 100%;
//   height: 2.5rem;
//   padding-left: 2.5rem;
//   border-radius: 0.5rem;
//   border: 1px solid #d1d5db;
//
//   &:focus {
//     outline: none;
//     box-shadow: 0 0 0 2px #f43f5e;
//   }
// `;
//
// const FlashcardContainer = styled.div`
//   max-width: 72rem;
// `;
//
// const FlashcardSetDiv = styled.div`
//   margin-bottom: 2rem;
// `;
//
// const SetTitle = styled.h3`
//   font-size: 1.125rem;
//   font-weight: 600;
//   color: #111827;
//   margin-bottom: 1rem;
// `;
//
// const FlashcardGrid = styled.div`
//   display: grid;
//   grid-template-columns: repeat(1,1fr);
//   gap: 1rem;
//
//   @media (min-width:768px){
//     grid-template-columns: repeat(2,1fr);
//   }
//
//   @media (min-width:1024px){
//     grid-template-columns: repeat(3,1fr);
//   }
// `;
//
// const FlashcardItem = ({ card }) => {
//   const [showAnswer, setShowAnswer] = useState(false);
//
//   return (
//     <FlashcardDiv
//       onClick={() => setShowAnswer(!showAnswer)}
//       style={{
//         cursor: "pointer",
//         display: "flex",
//         alignItems: "center",
//         justifyContent: "center",
//         textAlign: "center"
//       }}
//     >
//       <div style={{ padding: "1rem" }}>
//         <strong>{card.front}</strong>
//
//         {!showAnswer && (
//           <small style={{ display:"block", marginTop:"6px", color:"#9ca3af"}}>
//             Click to reveal answer
//           </small>
//         )}
//
//         {showAnswer && (
//           <p style={{ marginTop:"10px", color:"#374151"}}>
//             {card.back}
//           </p>
//         )}
//       </div>
//     </FlashcardDiv>
//   );
// };
//
// const FlashcardPage = () => {
//
//   const [selectedTags,setSelectedTags] = useState([]);
//   const [searchQuery,setSearchQuery] = useState("");
//   const [decks,setDecks] = useState([]);
//   const [cardsByDeck,setCardsByDeck] = useState({});
//   const [showFilters,setShowFilters] = useState(false);
//
//   useEffect(()=>{
//     fetchDecks();
//   },[]);
//
//   const fetchDecks = async () => {
//     try{
//       const res = await axios.get(
//         `${process.env.REACT_APP_API_URL}/api/flashcards/decks`
//       );
//
//       const deckList = res.data.items;
//       setDecks(deckList);
//
//       deckList.forEach(deck=>{
//         fetchCards(deck.id);
//       });
//
//     }catch(err){
//       console.error(err);
//     }
//   };
//
//   const fetchCards = async(deckId)=>{
//     try{
//       const res = await axios.get(
//         `${process.env.REACT_APP_API_URL}/api/flashcards/cards?deck_id=${deckId}`
//       );
//
//       setCardsByDeck(prev=>({
//         ...prev,
//         [deckId]:res.data.items
//       }));
//
//     }catch(err){
//       console.error(err);
//     }
//   };
//
//   const handleTagToggle = (tag)=>{
//     setSelectedTags(prev =>
//       prev.includes(tag)
//         ? prev.filter(t=>t!==tag)
//         : [...prev,tag]
//     );
//   };
//
//   const filterCards = (cards, deckTitle)=>{
//   return cards.filter(card => {
//
//     const searchMatch =
//       card.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       card.back.toLowerCase().includes(searchQuery.toLowerCase());
//
//     const tagMatch =
//       selectedTags.length === 0 ||
//       selectedTags.some(tag =>
//         deckTitle.toLowerCase().includes(tag.toLowerCase())
//       );
//
//     return searchMatch && tagMatch;
//   });
// };
//
//   return (
//     <PageContainer>
//       <MainContent>
//
//         <HeaderDiv>
//           <PageTitle>Medical flashcards</PageTitle>
//           <PageSubtitle>Practice on your own</PageSubtitle>
//
//           <TopBar>
//
//             <SearchContainer>
//               <SearchIconWrapper>
//                 <Search size={16}/>
//               </SearchIconWrapper>
//
//               <SearchInput
//                 placeholder="Search flashcards..."
//                 value={searchQuery}
//                 onChange={(e)=>setSearchQuery(e.target.value)}
//               />
//             </SearchContainer>
//
//                     <div style={{ position: "relative" }}>
//           <button
//             onClick={()=>setShowFilters(!showFilters)}
//             style={{
//               height:"2.5rem",
//               padding:"0 12px",
//               borderRadius:"6px",
//               border:"1px solid #d1d5db",
//               background:"white",
//               cursor:"pointer"
//             }}
//           >
//             Filters
//           </button>
//
//           {showFilters && (
//             <div
//               style={{
//                 position: "absolute",
//                 top: "110%",
//                 right: 0,
//                 background: "white",
//                 border: "1px solid #e5e7eb",
//                 borderRadius: "8px",
//                 padding: "10px",
//                 boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
//                 zIndex: 100,
//                 display: "flex",
//                 gap: "6px",
//                 flexWrap: "wrap",
//                 width: "260px"
//               }}
//             >
//                 {["Cardio","Examination","Emergency","Respiratory"].map(tag=>(
//                   <button
//                     key={tag}
//                     onClick={()=>handleTagToggle(tag)}
//                     style={{
//                       padding:"6px 10px",
//                       borderRadius:"6px",
//                       border:"1px solid #d1d5db",
//                       background:selectedTags.includes(tag) ? "#f43f5e":"white",
//                       color:selectedTags.includes(tag) ? "white":"#374151",
//                       cursor:"pointer"
//                     }}
//                   >
//                     {tag}
//                   </button>
//                 ))}
//             </div>
//           )}
//         </div>
//
//           </TopBar>
//         </HeaderDiv>
//         <FlashcardContainer>
//
//           {decks.map(deck => {
//
//             const filteredCards = filterCards(
//               cardsByDeck[deck.id] || [],
//               deck.title
//             );
//
//             if(filteredCards.length === 0) return null;
//
//             return (
//               <FlashcardSetDiv key={deck.id}>
//
//                 <SetTitle>{deck.title}</SetTitle>
//
//                 <FlashcardGrid>
//                   {filteredCards.map(card=>(
//                     <FlashcardItem
//                       key={card.id}
//                       card={card}
//                     />
//                   ))}
//                 </FlashcardGrid>
//
//               </FlashcardSetDiv>
//             );
//           })}
//
//         </FlashcardContainer>
//
//       </MainContent>
//     </PageContainer>
//   );
// };
//
// export default FlashcardPage;

export default function FlashcardPage() {
  return null;
}