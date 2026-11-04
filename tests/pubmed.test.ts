import { describe, expect, it } from "vitest";
import { parsePubmedXml } from "@/server/sources/pubmed";

const FIXTURE = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">12345678</PMID>
      <Article PubModel="Electronic">
        <Journal>
          <JournalIssue>
            <PubDate><Year>2026</Year><Month>Sep</Month><Day>29</Day></PubDate>
          </JournalIssue>
          <Title>Molecular Therapy Nucleic Acids</Title>
        </Journal>
        <ArticleTitle>Base editing using engineered TadA variants.</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">Base editors enable direct conversion.</AbstractText>
          <AbstractText>Here we test an engineered TadA variant.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author><LastName>Lee</LastName><ForeName>Wi-jae</ForeName><Initials>W</Initials></Author>
          <Author><CollectiveName>Consortium X</CollectiveName></Author>
        </AuthorList>
        <PublicationTypeList>
          <PublicationType>Journal Article</PublicationType>
        </PublicationTypeList>
        <ELocationID EIdType="doi">10.1016/j.omtn.2026.103121</ELocationID>
        <ArticleDate DateType="Electronic"><Year>2026</Year><Month>Sep</Month><Day>29</Day></ArticleDate>
      </Article>
      <CommentsCorrectionsList>
        <CommentsCorrections RefType="RetractionIn">
          <RefSource>Mol Ther Nucleic Acids. 2026 Oct 1;37(4):999.</RefSource>
          <PMID Version="1">99999999</PMID>
        </CommentsCorrections>
      </CommentsCorrectionsList>
      <KeywordList>
        <Keyword>Base Editing</Keyword>
        <Keyword>TadA</Keyword>
      </KeywordList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">12345678</ArticleId>
        <ArticleId IdType="doi">10.1016/j.omtn.2026.103121</ArticleId>
        <ArticleId IdType="pmc">PMC13691310</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

describe("parsePubmedXml", () => {
  it("parses identifiers, metadata and retraction signals", () => {
    const records = parsePubmedXml(FIXTURE);
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.pmid).toBe("12345678");
    expect(record.doi).toBe("10.1016/j.omtn.2026.103121");
    expect(record.pmcid).toBe("PMC13691310");
    expect(record.title).toContain("Base editing using engineered TadA");
    expect(record.journal).toBe("Molecular Therapy Nucleic Acids");
    expect(record.publicationDate).toBe("2026-09-29");
    expect(record.authors).toEqual(["Wi-jae Lee", "Consortium X"]);
    expect(record.abstract).toContain("BACKGROUND");
    expect(record.retractionStatus).toBe("retracted");
    expect(record.publicationStatus).toBe("retracted");
    expect(record.peerReviewStatus).toBe("peer_reviewed");
  });
});
