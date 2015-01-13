/*
 * SonarQube, open source software quality management tool.
 * Copyright (C) 2008-2014 SonarSource
 * mailto:contact AT sonarsource DOT com
 *
 * SonarQube is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * SonarQube is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

package org.sonar.server.db.migrations.v51;

import org.junit.ClassRule;
import org.junit.Test;
import org.sonar.api.utils.System2;
import org.sonar.core.persistence.DbTester;
import org.sonar.server.db.migrations.DatabaseMigration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class FeedIssueChangesLongDatesTest {
  @ClassRule
  public static DbTester db = new DbTester().schema(FeedIssueChangesLongDatesTest.class, "schema.sql");

  @Test
  public void execute() throws Exception {
    db.prepareDbUnit(getClass(), "before.xml");

    System2 system = mock(System2.class);
    when(system.now()).thenReturn(1500000000000L);
    DatabaseMigration migration = new FeedIssueChangesLongDates(db.database(), system);
    migration.execute();

    int count = db.countSql("select count(*) from issue_changes where created_at_ms is not null and updated_at_ms is not null");
    assertThat(count).isEqualTo(3);

    int countWithAllDateFieldsNull = db
      .countSql("select count(*) from issue_changes where created_at_ms is not null and updated_at_ms is not null and issue_change_creation_date_ms is not null");
    assertThat(countWithAllDateFieldsNull).isEqualTo(2);
  }
}
