/*
 * SonarQube
 * Copyright (C) 2009-2017 SonarSource SA
 * mailto:info AT sonarsource DOT com
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
package org.sonar.server.es;

import com.google.common.collect.ImmutableMap;
import java.util.ArrayList;
import java.util.Collection;
import java.util.stream.IntStream;
import org.apache.commons.lang.math.RandomUtils;
import org.elasticsearch.action.admin.indices.settings.get.GetSettingsResponse;
import org.elasticsearch.action.index.IndexRequest;
import org.elasticsearch.action.search.SearchRequestBuilder;
import org.elasticsearch.cluster.metadata.IndexMetaData;
import org.elasticsearch.index.query.QueryBuilders;
import org.junit.Ignore;
import org.junit.Rule;
import org.junit.Test;
import org.sonar.api.utils.internal.TestSystem2;
import org.sonar.db.DbTester;
import org.sonar.db.es.EsQueueDto;
import org.sonar.server.es.BulkIndexer.Size;

import static org.assertj.core.api.Assertions.assertThat;
import static org.sonar.server.es.FakeIndexDefinition.INDEX;
import static org.sonar.server.es.FakeIndexDefinition.INDEX_TYPE_FAKE;

public class BulkIndexerTest {

  private TestSystem2 testSystem2 = new TestSystem2().setNow(1_000L);

  @Rule
  public EsTester esTester = new EsTester(new FakeIndexDefinition().setReplicas(1));
  @Rule
  public DbTester dbTester = DbTester.create(testSystem2);

  @Test
  public void index_nothing() {
    BulkIndexer indexer = new BulkIndexer(esTester.client(), INDEX, Size.REGULAR);
    indexer.start();
    indexer.stop();

    assertThat(count()).isEqualTo(0);
  }

  @Test
  public void index_documents() {
    BulkIndexer indexer = new BulkIndexer(esTester.client(), INDEX, Size.REGULAR);
    indexer.start();
    indexer.add(newIndexRequest(42));
    indexer.add(newIndexRequest(78));

    // request is not sent yet
    assertThat(count()).isEqualTo(0);

    // send remaining requests
    indexer.stop();
    assertThat(count()).isEqualTo(2);
  }

  @Test
  public void large_indexing() {
    // index has one replica
    assertThat(replicas()).isEqualTo(1);

    BulkIndexer indexer = new BulkIndexer(esTester.client(), INDEX, Size.LARGE);
    indexer.start();

    // replicas are temporarily disabled
    assertThat(replicas()).isEqualTo(0);

    for (int i = 0; i < 10; i++) {
      indexer.add(newIndexRequest(i));
    }
    indexer.stop();

    assertThat(count()).isEqualTo(10);

    // replicas are re-enabled
    assertThat(replicas()).isEqualTo(1);
  }

  @Test
  public void bulk_delete() throws Exception {
    int max = 500;
    int removeFrom = 200;
    FakeDoc[] docs = new FakeDoc[max];
    for (int i = 0; i < max; i++) {
      docs[i] = FakeIndexDefinition.newDoc(i);
    }
    esTester.putDocuments(INDEX_TYPE_FAKE, docs);
    assertThat(count()).isEqualTo(max);

    SearchRequestBuilder req = esTester.client().prepareSearch(INDEX_TYPE_FAKE)
      .setQuery(QueryBuilders.rangeQuery(FakeIndexDefinition.INT_FIELD).gte(removeFrom));
    BulkIndexer.delete(esTester.client(), INDEX, req);

    assertThat(count()).isEqualTo(removeFrom);
  }

  @Test
  @Ignore
  public void when_index_is_done_EsQueues_must_be_deleted() {
    BulkIndexer indexer = new BulkIndexer(esTester.client(), INDEX, Size.REGULAR);
    int nbOfDelete = 10 + RandomUtils.nextInt(10);
    int nbOfInsert = 10 + RandomUtils.nextInt(10);
    int nbOfDocumentNotToBeDeleted = 10 + RandomUtils.nextInt(10);
    Collection<EsQueueDto> esQueueDtos = new ArrayList<>();

    // Those documents must be kept
    FakeDoc[] docs = new FakeDoc[nbOfDocumentNotToBeDeleted];
    for (int i = 1; i <= nbOfDocumentNotToBeDeleted; i++) {
      docs[i] = FakeIndexDefinition.newDoc(-i);
    }
    esTester.putDocuments(INDEX_TYPE_FAKE, docs);

    // Create nbOfDelete documents to be deleted
    docs = new FakeDoc[nbOfDelete];
    for (int i = 1; i <= nbOfDelete; i++) {
      docs[i] = FakeIndexDefinition.newDoc(i);
    }
    esTester.putDocuments(INDEX_TYPE_FAKE, docs);
    assertThat(count()).isEqualTo(nbOfDelete + nbOfDocumentNotToBeDeleted);

    indexer.start(dbTester.getSession(), dbTester.getDbClient(), esQueueDtos);
    // Create nbOfDelete for old Documents
    IntStream.rangeClosed(1, nbOfDelete).forEach(
      i -> indexer.addDeletion(INDEX_TYPE_FAKE, "" + i));
    // Create nbOfInsert for new Documents
    IntStream.rangeClosed(nbOfDelete + 1, nbOfInsert).forEach(
      i -> indexer.add(newIndexRequest(i)));
    indexer.stop();

    assertThat(count()).isEqualTo(nbOfInsert + nbOfDocumentNotToBeDeleted);
  }

  private long count() {
    return esTester.countDocuments("fakes", "fake");
  }

  private int replicas() {
    GetSettingsResponse settingsResp = esTester.client().nativeClient().admin().indices()
      .prepareGetSettings(INDEX).get();
    return Integer.parseInt(settingsResp.getSetting(INDEX, IndexMetaData.SETTING_NUMBER_OF_REPLICAS));
  }

  private IndexRequest newIndexRequest(int intField) {
    return new IndexRequest(INDEX, INDEX_TYPE_FAKE.getType())
      .source(ImmutableMap.of(FakeIndexDefinition.INT_FIELD, intField));
  }
}
